import test from 'node:test';
import assert from 'node:assert/strict';
import { PushToTalkSession } from '../lib/voice/push-to-talk.ts';

function fixture(timeoutMs) {
  const sent = [],
    errors = [],
    states = [],
    transcripts = [];
  const provider = {
    stops: 0,
    aborts: 0,
    start(text, end, error) {
      this.text = text;
      this.end = end;
      this.error = error;
    },
    stop() {
      this.stops++;
    },
    abort() {
      this.aborts++;
    },
  };
  const session = new PushToTalkSession(
    provider,
    {
      submit: (text) => sent.push(text),
      error: (message) => errors.push(message),
      state: (state) => states.push(state),
      transcript: (text) => transcripts.push(text),
    },
    timeoutMs,
  );
  return { session, provider, sent, errors, states, transcripts };
}

test('release uses the final transcript, not stale React text', () => {
  const { session, provider, sent } = fixture();
  session.start();
  provider.text('Set a timer for');
  session.release();
  assert.deepEqual(sent, []);
  assert.equal(provider.stops, 1);
  provider.text('Set a timer for ten minutes');
  provider.end();
  assert.deepEqual(sent, ['Set a timer for ten minutes']);
});

test('duplicate pointer release and recognition end submit only once', () => {
  const { session, provider, sent } = fixture();
  session.start();
  provider.text('Hello');
  session.release();
  session.release();
  provider.end();
  provider.end();
  session.release();
  assert.equal(provider.stops, 1);
  assert.deepEqual(sent, ['Hello']);
});

test('recognition ending while held waits until the button is released', () => {
  const { session, provider, sent } = fixture();
  session.start();
  provider.text('Already finished');
  provider.end();
  assert.deepEqual(sent, []);
  session.release();
  assert.deepEqual(sent, ['Already finished']);
  assert.equal(provider.stops, 0);
});

test('silence does not submit a blank message', () => {
  const { session, provider, sent, errors } = fixture();
  session.start();
  session.release();
  provider.end();
  assert.deepEqual(sent, []);
  assert.match(errors[0], /didn’t catch/);
});

test('cancel and microphone failures discard late transcripts', () => {
  for (const cancel of [
    (f) => f.session.cancel(),
    (f) => f.provider.error('Microphone denied'),
  ]) {
    const f = fixture();
    f.session.start();
    f.provider.text('Do not send');
    f.session.release();
    cancel(f);
    f.provider.end();
    assert.deepEqual(f.sent, []);
  }
});

test('old recognition callbacks cannot submit a subsequent turn', () => {
  const { session, provider, sent } = fixture();
  session.start();
  const oldText = provider.text,
    oldEnd = provider.end;
  session.start();
  provider.text('New turn');
  oldText('Stale words');
  oldEnd();
  session.release();
  provider.end();
  assert.deepEqual(sent, ['New turn']);
});

test('failed recognizer cleanup does not block the next turn', () => {
  const { session, provider, sent } = fixture();
  provider.abort = () => {
    provider.aborts++;
    throw new Error('recognizer already closed');
  };
  session.start();
  provider.text('First turn');
  session.release();
  provider.end();
  session.start();
  provider.text('Second turn');
  session.release();
  provider.end();
  assert.equal(provider.aborts, 2);
  assert.deepEqual(sent, ['First turn', 'Second turn']);
});

test('transcription timeout cancels without submitting partial text', async () => {
  const { session, provider, sent, errors } = fixture(5);
  session.start();
  provider.text('Partial');
  session.release();
  await new Promise((resolve) => setTimeout(resolve, 15));
  provider.end();
  assert.deepEqual(sent, []);
  assert.match(errors[0], /timed out/);
});
