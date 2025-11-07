#!/usr/bin/env node
'use strict'

const RPC = require('@hyperswarm/rpc')

async function testWorkerTimeouts(apiKeyHex) {
  if (!apiKeyHex) {
    console.error('❌ Usage: node test-worker-timeouts.js <api-worker-rpc-key>')
    console.error('   Get the key from API worker log: "wrk-data-shard-api-... rpc public key: XXXXX"')
    process.exit(1)
  }

  const rpc = new RPC()
  const apiKey = Buffer.from(apiKeyHex, 'hex')

  console.log('🧪 Testing Worker MongoDB Timeouts')
  console.log('📡 Using API key:', apiKeyHex.substring(0, 16) + '...\n')

  try {
    console.log('1️⃣ Creating a wallet (writes to MongoDB)...')
    const userId = `test-user-${Date.now()}`
    const wallet = {
      userId,
      type: 'channel',
      name: 'Test Wallet',
      enabled: true,
      channelId: 'channel-test',
      addresses: {
        ethereum: '0x' + '1'.repeat(40)
      }
    }

    const addPayload = Buffer.from(JSON.stringify({ userId, wallets: [wallet] }))
    const resultBuf = await rpc.request(apiKey, 'addWallet', addPayload)
    const result = JSON.parse(resultBuf.toString())
    console.log('✅ Wallet created:', result[0].id)

    console.log('\n2️⃣ Fetching wallet (reads from MongoDB)...')
    const fetchPayload = Buffer.from(JSON.stringify({ id: result[0].id }))
    const fetchResultBuf = await rpc.request(apiKey, 'getWallet', fetchPayload)
    const fetchResult = JSON.parse(fetchResultBuf.toString())
    console.log('✅ Wallet fetched:', fetchResult.id)

    console.log('\n3️⃣ Listing user wallets (MongoDB query)...')
    const listPayload = Buffer.from(JSON.stringify({ userId }))
    const listResultBuf = await rpc.request(apiKey, 'listWallets', listPayload)
    const listResult = JSON.parse(listResultBuf.toString())
    console.log('✅ Wallets listed:', listResult.wallets.length)

    console.log('\n✅ All operations completed successfully!')
    console.log('\n💡 Now you can test failure scenarios:')
    console.log('   1. Keep this script running')
    console.log('   2. In another terminal: docker stop mongo2 mongo3')
    console.log('   3. Try operations again - they should timeout gracefully')

  } catch (err) {
    console.error('❌ Error:', err.message)
    console.error('Stack:', err.stack)
  } finally {
    await rpc.destroy()
  }
}

// Run if called directly
if (require.main === module) {
  const apiKey = process.argv[2]
  testWorkerTimeouts(apiKey).catch(console.error)
}

module.exports = testWorkerTimeouts
