#!/usr/bin/env node
'use strict'

const { MongoClient } = require('mongodb')

async function testMongoTimeouts() {
  console.log('🧪 Testing MongoDB Timeout Configurations\n')

  // Use the same config as your workers
  const uri = 'mongodb://127.0.0.1:27017/?replicaSet=rs0&maxPoolSize=150'
  const client = new MongoClient(uri, {
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 10000
  })

  try {
    console.log('1️⃣ Connecting to MongoDB...')
    await client.connect()
    console.log('✅ Connected\n')

    const db = client.db('test_worker_timeouts')
    const collection = db.collection('test_wallets')

    console.log('2️⃣ Testing write operation...')
    const wallet = {
      userId: `user-${Date.now()}`,
      type: 'test',
      createdAt: new Date()
    }
    const result = await collection.insertOne(wallet)
    console.log('✅ Written:', result.insertedId, '\n')

    console.log('3️⃣ Testing read operation...')
    const found = await collection.findOne({ _id: result.insertedId })
    console.log('✅ Read:', found.userId, '\n')

    console.log('4️⃣ Testing transaction (requires replica set)...')
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        await collection.updateOne(
          { _id: result.insertedId },
          { $set: { updated: true } },
          { session }
        )
        console.log('✅ Transaction committed\n')
      }, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', wtimeout: 2000 },
        maxCommitTimeMS: 1500
      })
    } finally {
      await session.endSession()
    }

    console.log('✅ All MongoDB operations successful!\n')
    console.log('💡 Now test failure scenarios:')
    console.log('   In another terminal: docker stop mongo2 mongo3')
    console.log('   Then run this script again - operations should timeout')

  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.code) console.error('   Code:', err.code)
  } finally {
    await client.close()
  }
}

testMongoTimeouts().catch(console.error)
