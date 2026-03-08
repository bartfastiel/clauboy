/**
 * Test that docker attach with hijack:true produces a writable stream.
 * Tests against the running clauboy-issue-1 container.
 */
const Dockerode = require('dockerode')

const docker = new Dockerode({ socketPath: '//./pipe/docker_engine' })

async function test() {
  const container = docker.getContainer('clauboy-issue-1')

  console.log('Attaching with hijack:true...')
  const stream = await container.attach({
    stream: true,
    stdin: true,
    stdout: true,
    stderr: true,
    hijack: true
  })

  console.log('Stream type:', stream.constructor.name)
  console.log('Stream writable:', stream.writable)
  console.log('Stream readable:', stream.readable)

  let dataReceived = false
  let bytesReceived = 0

  stream.on('data', (data) => {
    bytesReceived += data.length
    if (!dataReceived) {
      dataReceived = true
      console.log('✅ Data received! First chunk length:', data.length)
      console.log('   Content sample:', JSON.stringify(data.slice(0, 50).toString()))
    }
  })

  stream.on('error', (err) => {
    console.error('Stream error:', err.message)
  })

  // Wait 1 second for initial data
  await new Promise(r => setTimeout(r, 1000))

  // Try writing
  console.log('\nAttempting to write to stream...')
  const written = stream.write('\r')
  console.log('Write returned:', written)

  await new Promise(r => setTimeout(r, 1000))
  console.log('Total bytes received:', bytesReceived)

  if (dataReceived && written !== false) {
    console.log('\n✅ SUCCESS: Stream is readable and writable')
  } else {
    console.log('\n❌ ISSUES:')
    if (!dataReceived) console.log('  - No data received from container')
    if (written === false) console.log('  - Write returned false (backpressure/not writable)')
  }

  stream.destroy()
}

test().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
