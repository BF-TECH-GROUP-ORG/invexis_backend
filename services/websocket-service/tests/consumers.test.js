describe('realtime consumer', () => {
  it('exports a startRealtimeConsumer function', () => {
    const { startRealtimeConsumer } = require('../src/consumers/realtime');
    expect(typeof startRealtimeConsumer).toBe('function');
  });
});

