import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from '@/components/chat/ChatView';
import { InterruptForm } from '@/components/interrupts/InterruptForm';
import { fieldsOf, readForm } from '@/lib/schema-form';
import { axeViolations } from '../support/axe';
import { envelope, ev, fakeRuntime, sse, SseFeed, type FakeRuntime } from '../support/fake-runtime';
import { renderApp } from '../support/render';

vi.mock('next/navigation', async () => (await import('../support/render')).nextNavigationMock());

const SESSION = '22222222-2222-4222-8222-222222222222';
const INPUT_SCHEMA = {
  type: 'object',
  properties: { value: { type: 'number' } },
  required: ['value'],
};
const APPROVAL_SCHEMA = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, comment: { type: 'string' } },
  required: ['approved'],
};

let runtime: FakeRuntime;
beforeEach(() => {
  runtime = fakeRuntime();
  runtime.on('GET /v1/sessions/{sessionId}', {
    sessionId: SESSION,
    agenticWorkflowId: 'wf',
    title: 'Facility operations',
    status: 'active',
    createdAt: '2026-10-27T09:00:00Z',
    updatedAt: '2026-10-27T09:00:00Z',
    lastMessageAt: '2026-10-27T09:00:00Z',
  });
  runtime.on('GET /v1/sessions/{sessionId}/messages', { items: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('interrupt forms', () => {
  it('[U-07] a human-input form from the schema shows validation errors inline; a valid answer resumes the run', async () => {
    const pause = new SseFeed();
    runtime.on('POST /v1/runs', () => pause.response);
    let answers = 0;
    runtime.on('POST /v1/runs/{runId}/interrupts/{interruptId}', () => {
      answers += 1;
      // The runtime checks the answer against the schema too; its errors name the field.
      if (answers === 1)
        return envelope(400, 'INTERRUPT_ANSWER_INVALID', 'The answer is not valid.', false, [
          { path: '.value', message: 'must be <= 100', type: 'less_than_equal' },
        ]);
      return sse([
        ev(5, 'node.started', { nodeType: 'llm', nodeName: 'Plan', visit: 1 }, { nodeId: 'plan' }),
        ev(6, 'token.delta', { text: 'Scheduling 500 units.' }, { nodeId: 'plan' }),
        ev(7, 'run.completed', { result: { text: 'Scheduling 500 units.' } }),
      ]);
    });
    const { container } = renderApp(<ChatView sessionId={SESSION} />);
    await screen.findByRole('heading', { name: 'Facility operations' });
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Order parts{Enter}');
    pause.send(ev(1, 'run.started', { sessionId: SESSION, agenticWorkflowId: 'wf', revision: '1' }));
    pause.send(ev(2, 'node.started', { nodeType: 'human_input', nodeName: 'How many', visit: 1 }, { nodeId: 'ask' }));
    pause.send(ev(3, 'interrupt.requested', { interruptId: 'int-1', kind: 'input', prompt: 'How many **units**?', schema: INPUT_SCHEMA }, { nodeId: 'ask' }));
    pause.send(ev(4, 'run.waiting', { interruptIds: ['int-1'] }));
    pause.end();

    const form = await screen.findByRole('form', { name: 'Input needed' });
    expect(form).toHaveTextContent('How many units?');
    await waitFor(() => expect(within(form).getByRole('heading', { name: 'Input needed' })).toHaveFocus());
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    expect(await axeViolations(container)).toEqual([]);

    // Empty, then not a number: errors beside the field, nothing sent.
    const field = within(form).getByRole('textbox', { name: 'Your answer' });
    await user.click(within(form).getByRole('button', { name: 'Send answer' }));
    expect(within(form).getByText('This field is required.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    await user.type(field, 'many');
    await user.click(within(form).getByRole('button', { name: 'Send answer' }));
    expect(within(form).getByText('Enter a number.')).toBeInTheDocument();
    expect(runtime.calls('POST /v1/runs/{runId}/interrupts/{interruptId}')).toHaveLength(0);

    // The runtime's own check fails: its message shows beside the field.
    await user.clear(field);
    await user.type(field, '500');
    await user.click(within(form).getByRole('button', { name: 'Send answer' }));
    expect(await within(form).findByText('must be <= 100')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-describedby', expect.stringContaining('error'));

    // A valid answer resumes the run in stream mode; the resumed turn streams into the chat.
    await user.click(within(form).getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Input needed' })).toBeNull());
    const calls = runtime.calls('POST /v1/runs/{runId}/interrupts/{interruptId}');
    expect(calls.at(-1)!.path).toBe('/v1/runs/run-1/interrupts/int-1');
    expect(calls.at(-1)!.body).toEqual({ answer: { value: 500 }, mode: 'stream' });
    expect(await screen.findByText('Scheduling 500 units.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus());
  });

  it('[U-07] an approval form approves or rejects with an optional comment', async () => {
    const answers: unknown[] = [];
    const onSubmit = vi.fn(async (answer: unknown) => {
      answers.push(answer);
      return undefined;
    });
    renderApp(
      <InterruptForm
        interrupt={{ interruptId: 'a-1', kind: 'approval', prompt: 'Publish the work order?', schema: APPROVAL_SCHEMA }}
        onSubmit={onSubmit}
      />,
    );
    const form = screen.getByRole('form', { name: 'Approval needed' });
    expect(within(form).queryByRole('checkbox')).toBeNull();
    const user = userEvent.setup();
    await user.type(within(form).getByRole('textbox', { name: 'Comment' }), 'Looks right');
    await user.click(within(form).getByRole('button', { name: 'Approve' }));
    await user.click(within(form).getByRole('button', { name: 'Reject' }));
    expect(answers).toEqual([
      { approved: true, comment: 'Looks right' },
      { approved: false, comment: 'Looks right' },
    ]);
  });

  it('[U-07] a reopened chat whose run waits shows the pending interrupts from the API', async () => {
    runtime.on('GET /v1/sessions/{sessionId}/messages', {
      items: [
        {
          messageId: 'm-1',
          sessionId: SESSION,
          runId: 'run-9',
          seq: 1,
          role: 'user',
          kind: 'user_input',
          visibility: 'chat',
          contentParts: [{ type: 'markdown', text: 'Publish it' }],
          textPreview: 'Publish it',
          createdAt: '2026-10-27T09:00:00Z',
        },
      ],
    });
    runtime.on('GET /v1/runs/{runId}', { runId: 'run-9', sessionId: SESSION, status: 'waiting_input', pendingInterrupts: ['a-9'] });
    runtime.on('GET /v1/runs/{runId}/interrupts', {
      items: [
        {
          interruptId: 'a-9',
          runId: 'run-9',
          nodeId: 'approve',
          kind: 'approval',
          prompt: { text: 'Publish the order?' },
          answerSchema: APPROVAL_SCHEMA,
          uiSchema: {},
          requestedAt: '2026-10-27T09:00:00Z',
        },
      ],
    });
    runtime.on('POST /v1/runs/{runId}/interrupts/{interruptId}', () =>
      sse([ev(4, 'run.completed', { result: { text: 'Published.' } }, { runId: 'run-9' })]),
    );
    renderApp(<ChatView sessionId={SESSION} />);
    const form = await screen.findByRole('form', { name: 'Approval needed' });
    expect(form).toHaveTextContent('Publish the order?');
    await userEvent.setup().click(within(form).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(runtime.calls('POST /v1/runs/{runId}/interrupts/{interruptId}')[0]!.body).toEqual({
        answer: { approved: false },
        mode: 'stream',
      }),
    );
    expect(runtime.calls('POST /v1/runs/{runId}/interrupts/{interruptId}')[0]!.path).toBe('/v1/runs/run-9/interrupts/a-9');
  });

  it('reads every field type of a schema and checks its bounds', () => {
    const fields = fieldsOf({
      type: 'object',
      properties: {
        priority: { enum: ['low', 'high'] },
        count: { type: 'integer', minimum: 1, maximum: 10 },
        urgent: { type: 'boolean' },
        code: { type: 'string', maxLength: 10, pattern: '^[A-Z]+$' },
        extra: { type: 'object' },
      },
      required: ['priority'],
    });
    expect(fields.map((field) => [field.name, field.kind, field.label])).toEqual([
      ['priority', 'choice', 'Priority'],
      ['count', 'integer', 'Count'],
      ['urgent', 'boolean', 'Urgent'],
      ['code', 'text', 'Code'],
      ['extra', 'json', 'Extra'],
    ]);
    expect(readForm(fields, { priority: 'high', count: '11', urgent: true, code: 'ab', extra: '{"a":1}' })).toEqual({
      value: { priority: 'high', urgent: true, extra: { a: 1 } },
      errors: { count: 'Enter 10 or less.', code: 'The value is not in the expected format.' },
    });
    expect(readForm(fields, { priority: '', count: '2', urgent: false, code: 'AB', extra: '' })).toEqual({
      value: { count: 2, urgent: false, code: 'AB' },
      errors: { priority: 'This field is required.' },
    });
  });
});

