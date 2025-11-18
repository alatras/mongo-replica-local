import { MongoClient, ClientSession } from 'mongodb';

/**
 * HANG ON COMMIT VERSION - Most likely scenario in production
 *
 * This reproduces the specific case where:
 * 1. Transaction operations complete successfully (nodes are still up)
 * 2. Nodes go down AFTER operations but BEFORE commit
 * 3. Commit hangs forever trying to get majority acknowledgment
 *
 * This is the most common production scenario for hanging writes.
 */

// Connection string with socketTimeoutMS=0 (infinite) to simulate production
const MONGO_URI = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0&socketTimeoutMS=0&serverSelectionTimeoutMS=300000';
const DB_NAME = 'testdb';
const COLLECTION_NAME = 'testcollection_hangcommit';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTransactionHangOnCommit(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  let session: ClientSession | null = null;

  try {
    console.log('='.repeat(60));
    console.log('MongoDB Transaction Test - HANG ON COMMIT');
    console.log('='.repeat(60));
    console.log(`Connection URI: ${MONGO_URI}`);
    console.log('');
    console.log('⚠️  This test will hang indefinitely on commit!');
    console.log('   socketTimeoutMS=0 (infinite socket timeout)');
    console.log('   No maxCommitTimeMS on transaction');
    console.log('   No wtimeout in write concern');
    console.log('');
    console.log('Use Ctrl+C to kill if it hangs.');
    console.log('='.repeat(60));
    console.log('');

    // Connect to MongoDB
    console.log('Connecting to MongoDB replica set...');
    await client.connect();
    console.log('Connected successfully!\n');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Start a session
    session = client.startSession();
    console.log('Session started\n');

    // Start transaction with NO TIMEOUTS
    const transactionOptions = {
      writeConcern: {
        w: 'majority' as const
        // NO wtimeout - commit will wait forever for majority
      },
      readConcern: { level: 'majority' as const }
      // NO maxCommitTimeMS - commit can take forever
    };

    session.startTransaction(transactionOptions);
    console.log('Transaction started (NO TIMEOUTS)\n');

    // Generate a unique test ID for this run
    const testId = `test-hangcommit-${Date.now()}`;

    // Do several operations inside the transaction
    console.log('Performing transaction operations...');
    for (let i = 0; i < 3; i++) {
      await collection.insertOne(
        {
          testId,
          operationNumber: i + 1,
          value: `operation-${i + 1}`,
          timestamp: new Date()
        },
        { session }
      );
      console.log(`  ✓ Operation ${i + 1} completed`);
    }
    console.log('All operations completed successfully!\n');

    // NOW - give user time to kill nodes BEFORE commit
    console.log('='.repeat(60));
    console.log('💡 CRITICAL: STOP NODES NOW!');
    console.log('');
    console.log('   The transaction operations are done, but NOT committed yet.');
    console.log('   Kill nodes now so that commit will hang:');
    console.log('');
    console.log('   Option 1 (network partition - more realistic):');
    console.log('   npm run partition:member -- mongo2 mongo3');
    console.log('');
    console.log('   Option 2 (stop containers):');
    console.log('   docker stop mongo2 mongo3');
    console.log('');
    console.log('   You have 30 seconds...');
    console.log('='.repeat(60));

    for (let i = 30; i > 0; i--) {
      if (i === 25) {
        console.log('\n\n   🚨 RUN THE PARTITION NOW! (allows time for iptables install)\n');
      }
      if (i === 10) {
        console.log('\n\n   ⚠️  LAST CHANCE! Partition must be active in 10 seconds!\n');
      }
      process.stdout.write(`\r   Committing in ${i} seconds... `);
      await sleep(1000);
    }
    console.log('\n');

    // Extra pause to ensure partition is in effect
    console.log('Waiting 5 more seconds to ensure partition is fully active...');
    await sleep(5000);
    console.log('');

    // This commit will hang forever if majority is lost
    console.log('NOW attempting commit...');
    console.log('Committing transaction (NO maxCommitTimeMS, NO wtimeout)...');
    console.log('⚠️  THIS WILL HANG INDEFINITELY if nodes are down!');
    console.log('⚠️  The driver will keep trying to reach majority forever...');
    console.log('');

    await session.commitTransaction();

    console.log('✓ Transaction committed successfully!\n');

  } catch (error: any) {
    console.error('\n' + '='.repeat(60));
    console.error('ERROR OCCURRED');
    console.error('='.repeat(60));

    const errorCode = error.code;
    const errorCodeName = error.codeName;
    const errorMessage = error.message;

    console.error(`Error Code: ${errorCode}`);
    console.error(`Error Name: ${errorCodeName || 'N/A'}`);
    console.error(`Error Message: ${errorMessage}\n`);

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
    } else if (errorCodeName === 'NotPrimaryOrSecondary' || errorCodeName === 'InterruptedDueToReplStateChange') {
      console.error('⚠️  Replica set topology changed during operation');
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
runTransactionHangOnCommit()
  .then(() => {
    console.log('\nScript finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nUnexpected error in main execution:', error);
    process.exit(1);
  });
