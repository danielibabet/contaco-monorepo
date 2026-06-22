import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || process.env.NEXT_PUBLIC_TABLE_NAME || 'ContaCoTable';

export async function POST(req: NextRequest) {
  try {
    const { chunk } = await req.json();

    if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
      return NextResponse.json({ error: 'No se envió un chunk válido' }, { status: 400 });
    }

    if (chunk.length > 25) {
      return NextResponse.json({ error: 'El chunk excede el límite de 25 peticiones de DynamoDB' }, { status: 400 });
    }

    const command = new BatchWriteCommand({
      RequestItems: {
          [TABLE_NAME]: chunk
      }
    });

    const response = await docClient.send(command);
    
    const unprocessed = response.UnprocessedItems?.[TABLE_NAME] || [];
    const unprocessedCount = unprocessed.length;

    return NextResponse.json({
      success: true,
      processed: chunk.length - unprocessedCount,
      unprocessed: unprocessedCount,
      unprocessedItems: unprocessed
    });

  } catch (error: any) {
    console.error('Error al insertar batch en DynamoDB:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
