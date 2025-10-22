import { Test, TestingModule } from '@nestjs/testing';

import { MonitoringService } from './monitoring.service';
import { AlertService } from './alert.service';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let alertService: jest.Mocked<AlertService>;

  beforeEach(async () => {
    const mockAlertService = {
      notify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: AlertService, useValue: mockAlertService },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
    alertService = module.get(AlertService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('increment', () => {
    it('should increment counter by 1 by default', () => {
      service.increment('requests.total');

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter?.count).toBe(1);
    });

    it('should increment counter by specified value', () => {
      service.increment('requests.total', 5);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter?.count).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      service.increment('requests.total', 3);
      service.increment('requests.total', 2);
      service.increment('requests.total', 4);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter?.count).toBe(9);
    });

    it('should handle negative values', () => {
      service.increment('requests.total', 10);
      service.increment('requests.total', -3);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter?.count).toBe(7);
    });

    it('should not go below zero', () => {
      service.increment('requests.total', 5);
      service.increment('requests.total', -10);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter?.count).toBe(0);
    });

    it('should ignore non-finite values', () => {
      service.increment('requests.total', NaN);
      service.increment('requests.total', Infinity);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter).toBeUndefined();
    });

    it('should ignore zero values', () => {
      service.increment('requests.total', 0);

      const snapshot = service.snapshot();
      const counter = snapshot.counters.find((c) => c.name === 'requests.total');

      expect(counter).toBeUndefined();
    });

    it('should track multiple counters independently', () => {
      service.increment('requests.total', 3);
      service.increment('errors.total', 1);
      service.increment('requests.total', 2);

      const snapshot = service.snapshot();
      const requests = snapshot.counters.find((c) => c.name === 'requests.total');
      const errors = snapshot.counters.find((c) => c.name === 'errors.total');

      expect(requests?.count).toBe(5);
      expect(errors?.count).toBe(1);
    });
  });

  describe('observe', () => {
    it('should record single observation', () => {
      service.observe('response.time', 150);

      const snapshot = service.snapshot();
      const summary = snapshot.summaries.find((s) => s.name === 'response.time');

      expect(summary?.count).toBe(1);
      expect(summary?.sum).toBe(150);
      expect(summary?.min).toBe(150);
      expect(summary?.max).toBe(150);
      expect(summary?.avg).toBe(150);
    });

    it('should record multiple observations', () => {
      service.observe('response.time', 100);
      service.observe('response.time', 200);
      service.observe('response.time', 150);

      const snapshot = service.snapshot();
      const summary = snapshot.summaries.find((s) => s.name === 'response.time');

      expect(summary?.count).toBe(3);
      expect(summary?.sum).toBe(450);
      expect(summary?.min).toBe(100);
      expect(summary?.max).toBe(200);
      expect(summary?.avg).toBe(150);
    });

    it('should track negative values', () => {
      service.observe('temperature', -10);
      service.observe('temperature', 5);
      service.observe('temperature', -20);

      const snapshot = service.snapshot();
      const summary = snapshot.summaries.find((s) => s.name === 'temperature');

      expect(summary?.min).toBe(-20);
      expect(summary?.max).toBe(5);
      expect(summary?.avg).toBeCloseTo(-8.33, 2);
    });

    it('should ignore non-finite values', () => {
      service.observe('response.time', 100);
      service.observe('response.time', NaN);
      service.observe('response.time', Infinity);

      const snapshot = service.snapshot();
      const summary = snapshot.summaries.find((s) => s.name === 'response.time');

      expect(summary?.count).toBe(1);
      expect(summary?.sum).toBe(100);
    });

    it('should round values to 4 decimal places', () => {
      service.observe('value', 1.123456789);

      const snapshot = service.snapshot();
      const summary = snapshot.summaries.find((s) => s.name === 'value');

      expect(summary?.sum).toBe(1.1235);
      expect(summary?.avg).toBe(1.1235);
    });

    it('should track multiple metrics independently', () => {
      service.observe('response.time', 100);
      service.observe('db.query.time', 50);
      service.observe('response.time', 200);

      const snapshot = service.snapshot();
      const response = snapshot.summaries.find((s) => s.name === 'response.time');
      const dbQuery = snapshot.summaries.find((s) => s.name === 'db.query.time');

      expect(response?.count).toBe(2);
      expect(response?.avg).toBe(150);
      expect(dbQuery?.count).toBe(1);
      expect(dbQuery?.avg).toBe(50);
    });
  });

  describe('recordError', () => {
    it('should record error with message', () => {
      const error = new Error('Database connection failed');
      service.recordError('db.connection', error);

      const snapshot = service.snapshot();
      const errorRecord = snapshot.errors.find((e) => e.metric === 'db.connection');

      expect(errorRecord?.lastMessage).toBe('Database connection failed');
      expect(errorRecord?.occurrences).toBe(1);
    });

    it('should increment error counters', () => {
      service.recordError('db.connection', new Error('Failed'));

      const snapshot = service.snapshot();
      const errorTotal = snapshot.counters.find((c) => c.name === 'errors.total');
      const specificError = snapshot.counters.find(
        (c) => c.name === 'db.connection.error_total'
      );

      expect(errorTotal?.count).toBe(1);
      expect(specificError?.count).toBe(1);
    });

    it('should count multiple error occurrences', () => {
      service.recordError('api.call', new Error('Timeout'));
      service.recordError('api.call', new Error('Connection refused'));
      service.recordError('api.call', new Error('Rate limited'));

      const snapshot = service.snapshot();
      const errorRecord = snapshot.errors.find((e) => e.metric === 'api.call');

      expect(errorRecord?.occurrences).toBe(3);
      expect(errorRecord?.lastMessage).toBe('Rate limited');
    });

    it('should handle string errors', () => {
      service.recordError('custom.error', 'Something went wrong');

      const snapshot = service.snapshot();
      const errorRecord = snapshot.errors.find((e) => e.metric === 'custom.error');

      expect(errorRecord?.lastMessage).toBe('Something went wrong');
    });

    it('should notify alert service', () => {
      const error = new Error('Critical failure');
      service.recordError('critical.error', error);

      expect(alertService.notify).toHaveBeenCalledWith({
        event: 'critical.error',
        error: 'Critical failure',
      });
    });

    it('should track different error types independently', () => {
      service.recordError('db.error', new Error('DB failed'));
      service.recordError('api.error', new Error('API failed'));
      service.recordError('db.error', new Error('DB failed again'));

      const snapshot = service.snapshot();
      const dbErrors = snapshot.errors.find((e) => e.metric === 'db.error');
      const apiErrors = snapshot.errors.find((e) => e.metric === 'api.error');

      expect(dbErrors?.occurrences).toBe(2);
      expect(apiErrors?.occurrences).toBe(1);
    });
  });

  describe('snapshot', () => {
    it('should return empty snapshot initially', () => {
      const snapshot = service.snapshot();

      expect(snapshot.counters).toEqual([]);
      expect(snapshot.summaries).toEqual([]);
      expect(snapshot.errors).toEqual([]);
      expect(snapshot.timestamp).toBeDefined();
    });

    it('should include all counters', () => {
      service.increment('counter1', 5);
      service.increment('counter2', 3);

      const snapshot = service.snapshot();

      expect(snapshot.counters).toHaveLength(2);
      expect(snapshot.counters.find((c) => c.name === 'counter1')?.count).toBe(5);
      expect(snapshot.counters.find((c) => c.name === 'counter2')?.count).toBe(3);
    });

    it('should include all summaries', () => {
      service.observe('metric1', 100);
      service.observe('metric2', 200);

      const snapshot = service.snapshot();

      expect(snapshot.summaries).toHaveLength(2);
      expect(snapshot.summaries.find((s) => s.name === 'metric1')).toBeDefined();
      expect(snapshot.summaries.find((s) => s.name === 'metric2')).toBeDefined();
    });

    it('should include all errors', () => {
      service.recordError('error1', new Error('First'));
      service.recordError('error2', new Error('Second'));

      const snapshot = service.snapshot();

      expect(snapshot.errors).toHaveLength(2);
    });

    it('should include timestamp in ISO format', () => {
      const snapshot = service.snapshot();

      expect(snapshot.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should handle min/max edge cases for summaries', () => {
      const snapshot = service.snapshot();

      expect(snapshot.summaries).toEqual([]);

      service.observe('test', 100);
      const snap2 = service.snapshot();
      const summary = snap2.summaries.find((s) => s.name === 'test');

      expect(summary?.min).toBe(100);
      expect(summary?.max).toBe(100);
    });
  });
});
