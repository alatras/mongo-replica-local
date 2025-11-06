import { MongoClient, ClientSession } from 'mongodb';

/**
 * NO TIMEOUT VERSION - Simulates production behavior where writes hang indefinitely
 *
 * Key differences from the regular version:
 * - NO maxTimeMS on operations
 * - NO wtimeout in write concern
 * - NO maxCommitTimeMS on transaction
 * - NO socketTimeoutMS in connection string
 *
 * This should reproduce the "hanging indefinitely" behavior seen in production
 * when replica set loses majority.
 */

// Replica set connection string WITHOUT socketTimeoutMS
// This is likely how production is configured
// Note: We explicitly set some timeouts to 0 (infinite) to truly simulate hanging
const MONGO_URI = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0&socketTimeoutMS=0&serverSelectionTimeoutMS=300000';
const DB_NAME = 'testdb';
const COLLECTION_NAME = 'testcollection_notimeout';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTransactionNoTimeout(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  let session: ClientSession | null = null;

  try {
    console.log('='.repeat(60));
    console.log('MongoDB Transaction Test - NO TIMEOUTS (Production Simulation)');
    console.log('='.repeat(60));
    console.log(`Connection URI: ${MONGO_URI}`);
    console.log('⚠️  WARNING: NO TIMEOUTS CONFIGURED');
    console.log('   - No maxTimeMS on operations');
    console.log('   - No wtimeout in write concern');
    console.log('   - No maxCommitTimeMS on transaction');
    console.log('   - No socketTimeoutMS in connection');
    console.log('');
    console.log('This test will HANG INDEFINITELY if majority is lost!');
    console.log('Use Ctrl+C to kill if it hangs.');
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

    // Start transaction with NO TIMEOUTS - this simulates production
    const transactionOptions = {
      writeConcern: {
        w: 'majority' as const
        // NO wtimeout - will wait forever for majority acknowledgment
      },
      readConcern: { level: 'majority' as const }
      // NO maxCommitTimeMS - commit can take forever
    };

    session.startTransaction(transactionOptions);
    console.log('Transaction started with options (NO TIMEOUTS):');
    console.log(JSON.stringify(transactionOptions, null, 2));
    console.log('');

    // Generate a unique test ID for this run
    const testId = `test-notimeout-${Date.now()}`;
    const testDoc = {
      testId,
      value: 'initial',
      timestamp: new Date()
    };

    // Operation 1: Insert WITHOUT maxTimeMS
    console.log(`Inserting document with testId: ${testId} (NO maxTimeMS)...`);
    const insertResult = await collection.insertOne(
      testDoc,
      {
        session
        // NO maxTimeMS - operation can hang forever
      }
    );
    console.log(`Insert successful: ${insertResult.insertedId}\n`);

    // Give user time to kill nodes BEFORE the next write operation
    console.log('='.repeat(60));
    console.log('💡 STOP NODES NOW! You have 5 seconds...');
    console.log('   Run in another terminal: docker stop mongo2 mongo3');
    console.log('='.repeat(60));
    await sleep(5000);
    console.log('');

    // Operation 2: Update WITHOUT maxTimeMS
    // This operation requires writing with majority write concern
    // If majority is lost, this will hang waiting for acknowledgment
    console.log(`Updating document (NO maxTimeMS)...`);
    console.log('⚠️  If majority is lost, this will HANG here!');
    const updateResult = await collection.updateOne(
      { testId },
      { $set: { value: 'updated', updatedAt: new Date() } },
      {
        session
        // NO maxTimeMS - operation can hang forever
      }
    );
    console.log(`Update successful: ${updateResult.modifiedCount} document(s) modified\n`);

    // Commit the transaction WITHOUT maxCommitTimeMS
    console.log('Committing transaction (NO maxCommitTimeMS)...');
    console.log('⚠️  If majority is lost, commit will HANG here!');
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
      console.error('   NOTE: This should NOT happen in no-timeout mode!');
    } else if (errorCodeName === 'WriteConcernFailed' || errorCode === 64) {
      console.error('⚠️  WriteConcernFailed: Write concern could not be satisfied');
      console.error('   NOTE: This should NOT happen without wtimeout!');
    } else if (errorCodeName === 'ExceededTimeLimit' || errorCode === 262) {
      console.error('⏱️  ExceededTimeLimit: Transaction exceeded maxCommitTimeMS');
      console.error('   NOTE: This should NOT happen without maxCommitTimeMS!');
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
runTransactionNoTimeout()
  .then(() => {
    console.log('\nScript finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nUnexpected error in main execution:', error);
    process.exit(1);
  });
