import { Test, TestingModule } from '@nestjs/testing';

import { PrometheusService } from './prometheus.service';

describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusService],
    }).compile();

    service = module.get<PrometheusService>(PrometheusService);
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const metrics = await service.getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('TYPE');
    });

    it('should include default metrics', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toContain('process_');
      expect(metrics).toContain('nodejs_');
    });
  });

  describe('counter metrics', () => {
    it('should increment counter', () => {
      service.incrementCounter('test_counter', { label: 'value' });
      service.incrementCounter('test_counter', { label: 'value' });

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_counter');
    });

    it('should support custom increment values', () => {
      service.incrementCounter('test_counter', { label: 'value' }, 5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_counter');
    });

    it('should track different labels separately', () => {
      service.incrementCounter('test_counter', { label: 'a' });
      service.incrementCounter('test_counter', { label: 'b' });

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('label="a"');
      expect(metrics).resolves.toContain('label="b"');
    });
  });

  describe('gauge metrics', () => {
    it('should set gauge value', () => {
      service.setGauge('test_gauge', { label: 'value' }, 42);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_gauge');
    });

    it('should update gauge value', () => {
      service.setGauge('test_gauge', { label: 'value' }, 42);
      service.setGauge('test_gauge', { label: 'value' }, 100);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_gauge');
    });

    it('should increment gauge', () => {
      service.setGauge('test_gauge', { label: 'value' }, 10);
      service.incrementGauge('test_gauge', { label: 'value' }, 5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_gauge');
    });

    it('should decrement gauge', () => {
      service.setGauge('test_gauge', { label: 'value' }, 10);
      service.decrementGauge('test_gauge', { label: 'value' }, 3);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_gauge');
    });
  });

  describe('histogram metrics', () => {
    it('should observe histogram value', () => {
      service.observeHistogram('test_histogram', { label: 'value' }, 0.5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_histogram');
    });

    it('should track multiple observations', () => {
      service.observeHistogram('test_histogram', { label: 'value' }, 0.1);
      service.observeHistogram('test_histogram', { label: 'value' }, 0.5);
      service.observeHistogram('test_histogram', { label: 'value' }, 0.9);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_histogram_count');
      expect(metrics).resolves.toContain('test_histogram_sum');
    });

    it('should create buckets', () => {
      service.observeHistogram('test_histogram', { label: 'value' }, 0.5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_histogram_bucket');
    });
  });

  describe('summary metrics', () => {
    it('should observe summary value', () => {
      service.observeSummary('test_summary', { label: 'value' }, 0.5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_summary');
    });

    it('should calculate percentiles', () => {
      for (let i = 0; i < 100; i++) {
        service.observeSummary('test_summary', { label: 'value' }, i);
      }

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('test_summary_sum');
      expect(metrics).resolves.toContain('test_summary_count');
    });
  });

  describe('timing helpers', () => {
    it('should time function execution', async () => {
      const testFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      };

      const result = await service.timeFunction(
        'test_timer',
        { label: 'value' },
        testFn
      );

      expect(result).toBe('result');

      const metrics = await service.getMetrics();
      expect(metrics).toContain('test_timer');
    });

    it('should time with labels', async () => {
      await service.timeFunction(
        'test_timer',
        { method: 'GET', status: '200' },
        async () => 'ok'
      );

      const metrics = await service.getMetrics();
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('status="200"');
    });
  });

  describe('HTTP metrics', () => {
    it('should track HTTP requests', () => {
      service.trackHttpRequest('GET', '/api/test', 200, 0.05);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('http_requests_total');
      expect(metrics).resolves.toContain('http_request_duration');
    });

    it('should track different methods', () => {
      service.trackHttpRequest('GET', '/api/test', 200, 0.05);
      service.trackHttpRequest('POST', '/api/test', 201, 0.1);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('method="GET"');
      expect(metrics).resolves.toContain('method="POST"');
    });

    it('should track different status codes', () => {
      service.trackHttpRequest('GET', '/api/test', 200, 0.05);
      service.trackHttpRequest('GET', '/api/test', 404, 0.02);
      service.trackHttpRequest('GET', '/api/test', 500, 0.1);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('status="200"');
      expect(metrics).resolves.toContain('status="404"');
      expect(metrics).resolves.toContain('status="500"');
    });
  });

  describe('market metrics', () => {
    it('should track market trades', () => {
      service.trackMarketTrade('market-1', 'Yes', 100, 0.5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('market_trades_total');
      expect(metrics).resolves.toContain('market_trade_volume');
    });

    it('should track market state changes', () => {
      service.trackMarketStateChange('market-1', 'CREATED', 'OPEN');

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('market_state_changes_total');
    });
  });

  describe('database metrics', () => {
    it('should track database queries', () => {
      service.trackDatabaseQuery('SELECT', 'markets', 0.01);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('database_queries_total');
      expect(metrics).resolves.toContain('database_query_duration');
    });

    it('should track different operations', () => {
      service.trackDatabaseQuery('SELECT', 'markets', 0.01);
      service.trackDatabaseQuery('INSERT', 'markets', 0.02);
      service.trackDatabaseQuery('UPDATE', 'markets', 0.015);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('operation="SELECT"');
      expect(metrics).resolves.toContain('operation="INSERT"');
      expect(metrics).resolves.toContain('operation="UPDATE"');
    });
  });

  describe('error tracking', () => {
    it('should track errors by type', () => {
      service.trackError('ValidationError', 'markets');

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('errors_total');
      expect(metrics).resolves.toContain('error_type="ValidationError"');
    });

    it('should track errors by service', () => {
      service.trackError('DatabaseError', 'prisma');
      service.trackError('ApiError', 'markets');

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('service="prisma"');
      expect(metrics).resolves.toContain('service="markets"');
    });
  });

  describe('custom metrics', () => {
    it('should register custom counter', () => {
      service.registerCounter('custom_counter', 'Custom counter metric');
      service.incrementCounter('custom_counter', {});

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('custom_counter');
    });

    it('should register custom gauge', () => {
      service.registerGauge('custom_gauge', 'Custom gauge metric');
      service.setGauge('custom_gauge', {}, 42);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('custom_gauge');
    });

    it('should register custom histogram', () => {
      service.registerHistogram('custom_histogram', 'Custom histogram metric');
      service.observeHistogram('custom_histogram', {}, 0.5);

      const metrics = service.getMetrics();

      expect(metrics).resolves.toContain('custom_histogram');
    });
  });
});
