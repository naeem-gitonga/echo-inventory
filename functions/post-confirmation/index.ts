import { CognitoUserPoolTriggerEvent } from 'aws-lambda';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, PutCommand } from '../shared/db';

export async function handler(event: CognitoUserPoolTriggerEvent): Promise<CognitoUserPoolTriggerEvent> {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const userId  = event.request.userAttributes.sub;
  const email   = event.request.userAttributes.email;
  const orgName = event.request.userAttributes['custom:orgName'] ?? 'My Organization';
  const orgId   = ulid();
  const now     = new Date().toISOString();

  await Promise.all([
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: 'METADATA',
        orgId,
        orgName,
        ownerId: userId,
        createdAt: now,
        entityType: 'ORG',
        GSI1PK: 'ORG',
        GSI1SK: now,
      },
    })),
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: `MEMBER#${userId}`,
        userId,
        email,
        role: 'owner',
        addedAt: now,
        addedBy: userId,
      },
    })),
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`,
        orgId,
        orgName,
        role: 'owner',
      },
    })),
  ]);

  return event;
}
