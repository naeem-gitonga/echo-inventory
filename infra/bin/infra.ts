#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const storageStack = new StorageStack(app, 'EchoInventoryStorage', { env });

const authStack = new AuthStack(app, 'EchoInventoryAuth', {
  env,
  table: storageStack.table,
});

new ApiStack(app, 'EchoInventoryApi', {
  env,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  orgsLambda: authStack.orgsLambda,
  table: storageStack.table,
});
