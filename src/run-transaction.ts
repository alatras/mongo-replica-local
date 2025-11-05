import { MongoClient, ClientSession } from 'mongodb';

// Configuration from environment with defaults
const W_TIMEOUT_MS = parseInt(process.env.W_TIMEOUT_MS || '2000', 10);
const MAX_COMMIT_MS = parseInt(process.env.MAX_COMMIT_MS || '1500', 10);
const OP_MAXTIME_MS = parseInt(process.env.OP_MAXTIME_MS || '1000', 10);

// Replica set connection string (Docker hostnames - ensure /etc/hosts is configured)
const MONGO_URI = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0';
const DB_NAME = 'testdb';
const COLLECTION_NAME = 'testcollection';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTransaction(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  let session: ClientSession | null = null;

  try {
    console.log('='.repeat(60));
    console.log('MongoDB Transaction Timeout Test');
    console.log('='.repeat(60));
    console.log(`Connection URI: ${MONGO_URI}`);
    console.log(`Write Concern Timeout: ${W_TIMEOUT_MS}ms`);
    console.log(`Max Commit Time: ${MAX_COMMIT_MS}ms`);
    console.log(`Operation MaxTime: ${OP_MAXTIME_MS}ms`);
    console.log('='.repeat(60));
    console.log('');

    // Connect to MongoDB
    console.log('Connecting to MongoDB replica set...');
    await client.connect();
    console.log('Connected successfully!\n');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Create a unique index to enable testing duplicate key scenarios
    try {
      await collection.createIndex({ testId: 1 }, { unique: true });
      console.log('Ensured unique index on testId field\n');
    } catch (err) {
      // Index might already exist
    }

    // Start a session
    session = client.startSession();
    console.log('Session started\n');

    // Start transaction with configured timeouts
    const transactionOptions = {
      writeConcern: {
        w: 'majority' as const,
        wtimeout: W_TIMEOUT_MS
      },
      readConcern: { level: 'majority' as const },
      maxCommitTimeMS: MAX_COMMIT_MS
    };

    session.startTransaction(transactionOptions);
    console.log('Transaction started with options:');
    console.log(JSON.stringify(transactionOptions, null, 2));
    console.log('');

    // Generate a unique test ID for this run
    const testId = `test-${Date.now()}`;
    const testDoc = {
      testId,
      value: 'initial',
      timestamp: new Date()
    };

    // Operation 1: Insert with maxTimeMS
    console.log(`Inserting document with testId: ${testId} (maxTimeMS: ${OP_MAXTIME_MS}ms)...`);
    const insertResult = await collection.insertOne(
      testDoc,
      {
        session,
        maxTimeMS: OP_MAXTIME_MS
      }
    );
    console.log(`Insert successful: ${insertResult.insertedId}\n`);

    // Sleep briefly to allow time for interruptions (e.g., stepdown)
    console.log('Sleeping 700ms between operations...');
    await sleep(700);

    // Operation 2: Update with maxTimeMS
    console.log(`Updating document (maxTimeMS: ${OP_MAXTIME_MS}ms)...`);
    const updateResult = await collection.updateOne(
      { testId },
      { $set: { value: 'updated', updatedAt: new Date() } },
      {
        session,
        maxTimeMS: OP_MAXTIME_MS
      }
    );
    console.log(`Update successful: ${updateResult.modifiedCount} document(s) modified\n`);

    // Commit the transaction
    console.log('Committing transaction...');
    await session.commitTransaction();
    console.log('✓ Transaction committed successfully!\n');

  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('ERROR OCCURRED');
    console.error('='.repeat(60));

    // Classify and log the error
    const errorCode = error.code;
    const errorCodeName = error.codeName;
    const errorMessage = error.message;

    console.error(`Error Code: ${errorCode}`);
    console.error(`Error Name: ${errorCodeName || 'N/A'}`);
    console.error(`Error Message: ${errorMessage}\n`);

    // Identify specific timeout/write concern errors
    if (errorCodeName === 'MaxTimeMSExpired' || errorCode === 50) {
      console.error('⏱️  MaxTimeMSExpired: Operation exceeded maxTimeMS timeout');
    } else if (errorCodeName === 'WriteConcernFailed' || errorCode === 64) {
      console.error('⚠️  WriteConcernFailed: Write concern could not be satisfied within wtimeout');
    } else if (errorCodeName === 'ExceededTimeLimit' || errorCode === 262) {
      console.error('⏱️  ExceededTimeLimit: Transaction exceeded maxCommitTimeMS');
    } else if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
      console.error('🔄 TransientTransactionError: Transaction can be retried');
    } else {
      console.error('❌ Other Error:', errorCodeName || 'Unknown');
    }
    console.error('='.repeat(60) + '\n');

    // Attempt to abort the transaction
    if (session && session.inTransaction()) {
      try {
        console.log('Attempting to abort transaction...');
        await session.abortTransaction();
        console.log('✓ Transaction aborted successfully\n');
      } catch (abortError: any) {
        console.error('Failed to abort transaction:', abortError.message, '\n');
      }
    }

  } finally {
    // CRITICAL: Always end the session
    if (session) {
      console.log('Ending session...');
      await session.endSession();
      console.log('✓ Session ended\n');
    }

    // Close client connection
    console.log('Closing MongoDB connection...');
    await client.close();
    console.log('✓ Connection closed\n');

    console.log('='.repeat(60));
    console.log('Test completed. Process exiting cleanly.');
    console.log('='.repeat(60));
  }
}

// Run the transaction
runTransaction()
  .then(() => {
    console.log('\nScript finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nUnexpected error in main execution:', error);
    process.exit(1);
  });
