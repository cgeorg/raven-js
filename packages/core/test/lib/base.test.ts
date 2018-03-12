import { expect } from 'chai';
import { spy } from 'sinon';
import { Breadcrumb, SentryEvent } from '../../src/lib/domain';
import { SentryError } from '../../src/lib/error';
import { TestBackend } from '../mocks/backend';
import { TEST_SDK, TestFrontend } from '../mocks/frontend';

const PUBLIC_DSN = 'https://username@domain/path';

describe('FrontendBase', () => {
  describe('constructor() / getDSN()', () => {
    it('returns the DSN', () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      expect(frontend.getDSN()!.toString()).to.equal(PUBLIC_DSN);
    });

    it('allows missing DSN', () => {
      const frontend = new TestFrontend({});
      expect(frontend.getDSN()).to.be.undefined;
    });

    it('throws with invalid DSN', () => {
      expect(() => new TestFrontend({ dsn: 'abc' })).to.throw(SentryError);
    });
  });

  describe('install()', () => {
    it('calls install() on Backend', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      await frontend.install();
      expect(TestBackend.instance!.installed).to.equal(1);
    });

    it('calls install() only once', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      await frontend.install();
      await frontend.install();
      expect(TestBackend.instance!.installed).to.equal(1);
    });

    it('resolves the result of install()', async () => {
      const frontend = new TestFrontend({ mockInstallFailure: true });
      const installed = await frontend.install();
      expect(installed).to.be.false;
    });

    it('does not install() when disabled', async () => {
      const frontend = new TestFrontend({ enabled: false, dsn: PUBLIC_DSN });
      await frontend.install();
      expect(TestBackend.instance!.installed).to.equal(0);
    });

    it('does not install() without DSN', async () => {
      const frontend = new TestFrontend({});
      await frontend.install();
      expect(TestBackend.instance!.installed).to.equal(0);
    });
  });

  describe('getOptions() / setOptions()', () => {
    it('returns the options', () => {
      const options = { dsn: PUBLIC_DSN, test: true };
      const frontend = new TestFrontend(options);
      expect(frontend.getOptions()).to.deep.equal(options);
    });

    it('merges options on update', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, test: true });
      await frontend.setOptions({ test: false });
      expect(frontend.getOptions()).to.deep.equal({
        dsn: PUBLIC_DSN,
        test: false,
      });
    });

    it('updates the DSN along with options', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      const dsn = 'https://emanresu@niamod/htap';
      await frontend.setOptions({ dsn });
      expect(frontend.getDSN()!.toString()).to.equal(dsn);
    });
  });

  describe('getContext() / setContext()', () => {
    it('loads the context from the backend', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.context = { extra: { initial: true } };
      const context = await frontend.getContext();
      expect(context).to.deep.equal(TestBackend.instance!.context);
    });

    it('stores the context on the backend', async () => {
      const frontend = new TestFrontend({});
      const context = { extra: { updated: true } };
      await frontend.setContext(context);
      expect(TestBackend.instance!.context).to.deep.equal(context);
    });

    it('merges extra into context', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.context = { extra: { a: 'a' } };
      await frontend.setContext({ extra: { b: 'b' } });
      expect(TestBackend.instance!.context).to.deep.equal({
        extra: { a: 'a', b: 'b' },
      });
    });

    it('merges tags into context', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.context = { tags: { a: 'a' } };
      await frontend.setContext({ tags: { b: 'b' } });
      expect(TestBackend.instance!.context).to.deep.equal({
        tags: { a: 'a', b: 'b' },
      });
    });

    it('merges user into context', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.context = { user: { id: 'a' } };
      await frontend.setContext({ user: { email: 'b' } });
      expect(TestBackend.instance!.context).to.deep.equal({
        user: { id: 'a', email: 'b' },
      });
    });

    it('caches the context', async () => {
      const frontend = new TestFrontend({});
      const loadContext = spy(TestBackend.instance!, 'loadContext');
      await frontend.getContext();
      await frontend.getContext();
      expect(loadContext.callCount).to.equal(1);
    });

    it('allows concurrent updates', async () => {
      const frontend = new TestFrontend({});
      const storeContext = spy(TestBackend.instance!, 'storeContext');
      await Promise.all([
        frontend.setContext({ user: { email: 'a' } }),
        frontend.setContext({ user: { id: 'b' } }),
      ]);
      expect(storeContext.getCall(1).args[0]).to.deep.equal({
        user: {
          email: 'a',
          id: 'b',
        },
      });
    });
  });

  describe('getBreadcrumbs() / addBreadcrumb()', () => {
    it('adds a breadcrumb', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.breadcrumbs = [{ message: 'hello' }];
      await frontend.addBreadcrumb({ message: 'world' });
      expect(TestBackend.instance!.breadcrumbs[1].message).to.equal('world');
    });

    it('adds a timestamp to new breadcrumbs', async () => {
      const frontend = new TestFrontend({});
      TestBackend.instance!.breadcrumbs = [{ message: 'hello' }];
      await frontend.addBreadcrumb({ message: 'world' });
      expect(TestBackend.instance!.breadcrumbs[1].timestamp).to.be.a('number');
    });

    it('discards breadcrumbs beyond maxBreadcrumbs', async () => {
      const frontend = new TestFrontend({ maxBreadcrumbs: 1 });
      TestBackend.instance!.breadcrumbs = [{ message: 'hello' }];
      await frontend.addBreadcrumb({ message: 'world' });
      expect(TestBackend.instance!.breadcrumbs.length).to.equal(1);
      expect(TestBackend.instance!.breadcrumbs[0].message).to.equal('world');
    });

    it('exits early when breadcrumbs are deactivated', async () => {
      const shouldAddBreadcrumb = spy();
      const frontend = new TestFrontend({
        maxBreadcrumbs: 0,
        shouldAddBreadcrumb,
      });

      await frontend.addBreadcrumb({ message: 'hello' });
      expect(shouldAddBreadcrumb.callCount).to.equal(0);
    });

    it('calls shouldAddBreadcrumb and adds the breadcrumb', async () => {
      const shouldAddBreadcrumb = spy(() => true);
      const frontend = new TestFrontend({ shouldAddBreadcrumb });

      await frontend.addBreadcrumb({ message: 'hello' });
      expect(TestBackend.instance!.breadcrumbs.length).to.equal(1);
    });

    it('calls shouldAddBreadcrumb and discards the breadcrumb', async () => {
      const shouldAddBreadcrumb = spy(() => false);
      const frontend = new TestFrontend({ shouldAddBreadcrumb });

      await frontend.addBreadcrumb({ message: 'hello' });
      expect(TestBackend.instance!.breadcrumbs.length).to.equal(0);
    });

    it('calls beforeBreadcrumb and uses the new one', async () => {
      const beforeBreadcrumb = spy(() => ({ message: 'changed' }));
      const frontend = new TestFrontend({ beforeBreadcrumb });

      await frontend.addBreadcrumb({ message: 'hello' });
      expect(TestBackend.instance!.breadcrumbs[0].message).to.equal('changed');
    });

    it('calls afterBreadcrumb', async () => {
      const afterBreadcrumb = spy();
      const frontend = new TestFrontend({ afterBreadcrumb });

      await frontend.addBreadcrumb({ message: 'hello' });
      const breadcrumb = afterBreadcrumb.getCall(0).args[0] as Breadcrumb;
      expect(breadcrumb.message).to.equal('hello');
    });

    it('caches the breadcrumbs', async () => {
      const frontend = new TestFrontend({});
      const loadBreadcrumbs = spy(TestBackend.instance!, 'loadBreadcrumbs');
      await frontend.addBreadcrumb({ message: 'hello' });
      await frontend.addBreadcrumb({ message: 'world' });
      expect(loadBreadcrumbs.callCount).to.equal(1);
    });

    it('allows concurrent updates', async () => {
      const frontend = new TestFrontend({});
      const storeBreadcrumbs = spy(TestBackend.instance!, 'storeBreadcrumbs');
      await Promise.all([
        frontend.addBreadcrumb({ message: 'hello' }),
        frontend.addBreadcrumb({ message: 'world' }),
      ]);
      expect(storeBreadcrumbs.getCall(1).args[0]).to.have.lengthOf(2);
    });
  });

  describe('captures', () => {
    it('captures and sends exceptions', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      await frontend.captureException(new Error('test exception'));
      expect(TestBackend.instance!.event).to.deep.equal({
        exception: [
          {
            type: 'Error',
            value: 'random error',
          },
        ],
        message: 'Error: test exception',
        sdk: TEST_SDK,
      });
    });

    it('captures and sends messages', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      await frontend.captureMessage('test message');
      expect(TestBackend.instance!.event).to.deep.equal({
        message: 'test message',
        sdk: TEST_SDK,
      });
    });
  });

  describe('captureEvent() / prepareEvent()', () => {
    it('skips when disabled', async () => {
      const frontend = new TestFrontend({ enabled: false, dsn: PUBLIC_DSN });
      await frontend.captureEvent({});
      expect(TestBackend.instance!.event).to.be.undefined;
    });

    it('skips without a DSN', async () => {
      const frontend = new TestFrontend({});
      await frontend.captureEvent({});
      expect(TestBackend.instance!.event).to.be.undefined;
    });

    it('sends an event', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!.message).to.equal('message');
      expect(TestBackend.instance!.event).to.deep.equal({
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    it('adds the configured environment', async () => {
      const frontend = new TestFrontend({
        dsn: PUBLIC_DSN,
        environment: 'env',
      });

      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!).to.deep.equal({
        environment: 'env',
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    it('adds the configured release', async () => {
      const frontend = new TestFrontend({
        dsn: PUBLIC_DSN,
        release: 'v1.0.0',
      });

      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!).to.deep.equal({
        message: 'message',
        release: 'v1.0.0',
        sdk: TEST_SDK,
      });
    });

    it('adds breadcrumbs', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      TestBackend.instance!.breadcrumbs = [{ message: 'breadcrumb' }];

      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!).to.deep.equal({
        breadcrumbs: [{ message: 'breadcrumb' }],
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    it('limits previously saved breadcrumbs', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, maxBreadcrumbs: 1 });
      TestBackend.instance!.breadcrumbs = [{ message: '1' }, { message: '2' }];

      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!).to.deep.equal({
        breadcrumbs: [{ message: '2' }],
        message: 'message',
        sdk: TEST_SDK,
      });
    });

    it('adds context data', async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      TestBackend.instance!.context = {
        extra: { a: 'a' },
        tags: { b: 'b' },
        user: { id: 'user' },
      };

      await frontend.captureEvent({ message: 'message' });
      expect(TestBackend.instance!.event!).to.deep.equal({
        extra: { a: 'a' },
        message: 'message',
        sdk: TEST_SDK,
        tags: { b: 'b' },
        user: { id: 'user' },
      });
    });

    it('calls shouldSend and adds the event', async () => {
      const shouldSend = spy(() => true);
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, shouldSend });

      await frontend.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event).to.deep.equal({
        message: 'hello',
        sdk: TEST_SDK,
      });
    });

    it('calls shouldSend and discards the event', async () => {
      const shouldSend = spy(() => false);
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, shouldSend });

      await frontend.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event).to.be.undefined;
    });

    it('calls beforeSend and uses the new one', async () => {
      const beforeSend = spy(() => ({ message: 'changed' }));
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, beforeSend });

      await frontend.captureEvent({ message: 'hello' });
      expect(TestBackend.instance!.event!.message).to.equal('changed');
    });

    it('calls afterSend', async () => {
      const afterSend = spy();
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN, afterSend });

      await frontend.captureEvent({ message: 'hello' });
      const breadcrumb = afterSend.getCall(0).args[0] as SentryEvent;
      expect(breadcrumb.message).to.equal('hello');
    });

    it("doesn't do anything with rate limits yet", async () => {
      const frontend = new TestFrontend({ dsn: PUBLIC_DSN });
      TestBackend.instance!.sendEvent = async () => 429;
      await frontend.captureEvent({});
      // TODO: Test rate limiting queues here
    });
  });
});