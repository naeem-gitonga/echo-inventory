import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  orgsLambda: lambdaNodejs.NodejsFunction;
  table: dynamodb.Table;
  bucket: s3.Bucket;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, table, bucket, orgsLambda } = props;

    const MODEL_ID = 'amazon.nova-lite-v1:0';

    const sharedEnv = {
      TABLE_NAME: table.tableName,
      BUCKET_NAME: bucket.bucketName,
      MODEL_ID,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
    };

    const lambdaDefaults: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: { minify: true, externalModules: [] },
      environment: sharedEnv,
    };

    const fn = (id: string, entry: string, overrides?: Partial<lambdaNodejs.NodejsFunctionProps>) =>
      new lambdaNodejs.NodejsFunction(this, id, {
        ...lambdaDefaults,
        entry: path.join(__dirname, '..', '..', 'functions', entry),
        handler: 'handler',
        ...overrides,
      });

    // ── 4 Lambda functions ────────────────────────────────────────────────────

    const authFn = fn('AuthFunction', 'auth/index.ts', { timeout: cdk.Duration.seconds(15) });
    authFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:SignUp', 'cognito-idp:ConfirmSignUp', 'cognito-idp:InitiateAuth'],
      resources: [userPool.userPoolArn],
    }));

    // orgsLambda comes from AuthStack (it's also the Cognito post-confirmation trigger)
    const inventoryFn = fn('InventoryFunction', 'inventory/index.ts');
    const membersFn   = fn('MembersFunction',   'members/index.ts');
    const imageFn     = fn('ImageFunction',     'image/index.ts', {
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });

    // ── DynamoDB permissions ──────────────────────────────────────────────────

    table.grantReadData(orgsLambda);        // already has write from AuthStack; ensure read too
    table.grantReadWriteData(inventoryFn);
    table.grantReadWriteData(membersFn);
    table.grantReadWriteData(imageFn);

    // ── S3 permissions ────────────────────────────────────────────────────────

    bucket.grantPut(imageFn, 'archive/*');

    // ── Bedrock permission ────────────────────────────────────────────────────

    imageFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/${MODEL_ID}`],
    }));

    // ── Cognito AdminCreateUser (add-member route) ────────────────────────────

    membersFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:AdminCreateUser'],
      resources: [userPool.userPoolArn],
    }));

    // ── API Gateway ───────────────────────────────────────────────────────────

    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'echo-inventory-api',
      corsPreflight: {
        allowOrigins: ['http://localhost:3000'], // update with Vercel URL after deploy
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const authorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] }
    );

    const route = (
      method: apigwv2.HttpMethod,
      routePath: string,
      handler: lambda.IFunction,
      isPublic = false
    ) => {
      api.addRoutes({
        path: routePath,
        methods: [method],
        integration: new apigwv2Integrations.HttpLambdaIntegration(
          `${handler.node.id}${method}${routePath.replace(/\//g, '_')}`,
          handler
        ),
        ...(!isPublic ? { authorizer } : {}),
      });
    };

    // Auth routes (no JWT authorizer — handles login/signup/refresh)
    route(apigwv2.HttpMethod.ANY, '/auth/{proxy+}', authFn, true);

    // Orgs routes
    route(apigwv2.HttpMethod.GET, '/orgs', orgsLambda);

    // Public routes (no JWT authorizer at gateway level)
    route(apigwv2.HttpMethod.GET,  '/public/orgs',                 orgsLambda, true);
    route(apigwv2.HttpMethod.POST, '/public/orgs/{orgId}/capture', imageFn,    true);

    // Protected routes (JWT validated at gateway + inside Lambda)
    route(apigwv2.HttpMethod.GET,    '/orgs/{orgId}/inventory',           inventoryFn);
    route(apigwv2.HttpMethod.POST,   '/orgs/{orgId}/inventory',           inventoryFn);
    route(apigwv2.HttpMethod.PATCH,  '/orgs/{orgId}/inventory/{itemId}',  inventoryFn);
    route(apigwv2.HttpMethod.DELETE, '/orgs/{orgId}/inventory/{itemId}',  inventoryFn);
    route(apigwv2.HttpMethod.GET,    '/orgs/{orgId}/members',             membersFn);
    route(apigwv2.HttpMethod.POST,   '/orgs/{orgId}/members',             membersFn);
    route(apigwv2.HttpMethod.DELETE, '/orgs/{orgId}/members/{userId}',    membersFn);
    route(apigwv2.HttpMethod.POST,   '/orgs/{orgId}/capture',             imageFn);

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }
}
