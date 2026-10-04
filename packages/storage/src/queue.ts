import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export interface JobQueue<T> {
  send(msg: T): Promise<void>;
  receive(opts: { max: number; waitSeconds: number }): Promise<Array<{ handle: string; body: T }>>;
  delete(handle: string): Promise<void>;
}

export function createSqsQueue<T>(opts: {
  url: string;
  region: string;
  parse: (raw: unknown) => T;
  client?: SQSClient;
}): JobQueue<T> {
  const client = opts.client ?? new SQSClient({ region: opts.region });
  return {
    async send(msg) {
      await client.send(
        new SendMessageCommand({ QueueUrl: opts.url, MessageBody: JSON.stringify(msg) }),
      );
    },
    async receive({ max, waitSeconds }) {
      const r = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: opts.url,
          MaxNumberOfMessages: Math.min(10, max),
          WaitTimeSeconds: waitSeconds,
        }),
      );
      const out: Array<{ handle: string; body: T }> = [];
      for (const m of r.Messages ?? []) {
        if (!m.ReceiptHandle || !m.Body) continue;
        try {
          out.push({ handle: m.ReceiptHandle, body: opts.parse(JSON.parse(m.Body)) });
        } catch {
          // poison message: drop
          await client.send(
            new DeleteMessageCommand({ QueueUrl: opts.url, ReceiptHandle: m.ReceiptHandle }),
          );
        }
      }
      return out;
    },
    async delete(handle) {
      await client.send(new DeleteMessageCommand({ QueueUrl: opts.url, ReceiptHandle: handle }));
    },
  };
}
