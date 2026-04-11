import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface AuthStackProps extends cdk.StackProps {
  table: dynamodb.Table;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly orgsLambda: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { table } = props;

    // Separate Lambda for the Cognito post-confirmation trigger.
    // Must NOT reference UserPool or UserPoolClient — that would create a circular
    // dependency (UserPool → trigger fn → UserPool).
    const postConfirmationFn = new lambdaNodejs.NodejsFunction(this, 'PostConfirmationFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '..', '..', 'functions', 'orgs', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: { minify: true, externalModules: [] },
    });

    table.grantReadWriteData(postConfirmationFn);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'echo-inventory-user-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      customAttributes: {
        orgName: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: "You've been invited to Echo Inventory",
        emailBody: `
<p>Hi {username},</p>
<p>You've been added to an organization on <strong>Echo Inventory</strong>.</p>
<p>Use the details below to sign in for the first time — you'll be asked to set your own password.</p>
<p><strong>Email:</strong> {username}<br/>
<strong>Temporary password:</strong> {####}</p>
<p>Sign in at: <a href="https://echo-inventory.vercel.app/login">https://echo-inventory.vercel.app/login</a></p>
<p>— The Echo Inventory Team</p>
        `.trim(),
      },
      userVerification: {
        emailSubject: 'Verify your Echo Inventory account',
        emailBody: `
<p>Hi there,</p>
<p>Thanks for signing up for <strong>Echo Inventory</strong>.</p>
<p>Your verification code is: <strong>{####}</strong></p>
<p>Enter this code to activate your account and start managing your inventory.</p>
<p>— The Echo Inventory Team</p>
        `.trim(),
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      lambdaTriggers: {
        postConfirmation: postConfirmationFn,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'echo-inventory-spa-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true })
        .withCustomAttributes('orgName'),
    });

    // API-facing orgs Lambda — no circular dependency since it is not a Cognito trigger
    this.orgsLambda = new lambdaNodejs.NodejsFunction(this, 'OrgsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '..', '..', 'functions', 'orgs', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
      },
      bundling: { minify: true, externalModules: [] },
    });

    table.grantReadWriteData(this.orgsLambda);

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
