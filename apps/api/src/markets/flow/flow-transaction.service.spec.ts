import { Test, TestingModule } from '@nestjs/testing';

import { FlowTransactionService } from './flow-transaction.service';
import { FlowCliService } from '../../flow/flow-cli.service';

describe('FlowTransactionService', () => {
  let service: FlowTransactionService;
  let flowCliService: jest.Mocked<FlowCliService>;

  beforeEach(async () => {
    const mockFlowCliService = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowTransactionService,
        { provide: FlowCliService, useValue: mockFlowCliService },
      ],
    }).compile();

    service = module.get<FlowTransactionService>(FlowTransactionService);
    flowCliService = module.get(FlowCliService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should send transaction successfully', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123\nStatus: Sealed',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
      });

      expect(result.transactionId).toBe('0xabc123');
      expect(flowCliService.execute).toHaveBeenCalledWith([
        'transactions',
        'send',
        './transactions/test.cdc',
        '--args-json',
        '[]',
        '--signer',
        'testnet-deployer',
        '--yes',
        '--wait',
      ]);
    });

    it('should pass arguments correctly', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123',
        stderr: '',
        exitCode: 0,
      });

      await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [
          { type: 'UInt64', value: 123 },
          { type: 'String', value: 'test' },
        ],
        signer: 'testnet-deployer',
      });

      expect(flowCliService.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          '--args-json',
          expect.stringContaining('UInt64'),
        ])
      );
    });

    it('should use custom network', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123',
        stderr: '',
        exitCode: 0,
      });

      await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
        network: 'mainnet',
      });

      expect(flowCliService.execute).toHaveBeenCalledWith(
        expect.arrayContaining(['--network', 'mainnet'])
      );
    });

    it('should skip waiting if waitForSeal is false', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123',
        stderr: '',
        exitCode: 0,
      });

      await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
        waitForSeal: false,
      });

      expect(flowCliService.execute).toHaveBeenCalledWith(
        expect.not.arrayContaining(['--wait'])
      );
    });

    it('should throw on CLI error', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: '',
        stderr: 'Error: Transaction failed',
        exitCode: 1,
      });

      await expect(
        service.send({
          transactionPath: './transactions/test.cdc',
          arguments: [],
          signer: 'testnet-deployer',
        })
      ).rejects.toThrow('Transaction failed');
    });

    it('should throw when transaction ID not found', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Some output without transaction ID',
        stderr: '',
        exitCode: 0,
      });

      await expect(
        service.send({
          transactionPath: './transactions/test.cdc',
          arguments: [],
          signer: 'testnet-deployer',
        })
      ).rejects.toThrow('Unable to parse transaction id');
    });

    it('should extract transaction ID from complex output', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: `
          Sending transaction...
          Transaction ID: 0xdef456789
          Status: Pending
          Status: Sealed
        `,
        stderr: '',
        exitCode: 0,
      });

      const result = await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
      });

      expect(result.transactionId).toBe('0xdef456789');
    });

    it('should handle mixed case transaction IDs', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xAbC123DeF',
        stderr: '',
        exitCode: 0,
      });

      const result = await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
      });

      expect(result.transactionId).toBe('0xAbC123DeF');
    });

    it('should include stdout and stderr in result', async () => {
      const stdout = 'Transaction ID: 0xabc123\nSuccess';
      const stderr = 'Warning: something';

      flowCliService.execute.mockResolvedValue({
        stdout,
        stderr,
        exitCode: 0,
      });

      const result = await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
      });

      expect(result.rawStdout).toBe(stdout);
      expect(result.rawStderr).toBe(stderr);
    });
  });

  describe('argument formatting', () => {
    it('should format empty arguments', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123',
        stderr: '',
        exitCode: 0,
      });

      await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [],
        signer: 'testnet-deployer',
      });

      const call = flowCliService.execute.mock.calls[0][0];
      const argsIndex = call.indexOf('--args-json');
      expect(call[argsIndex + 1]).toBe('[]');
    });

    it('should format complex arguments', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: 'Transaction ID: 0xabc123',
        stderr: '',
        exitCode: 0,
      });

      await service.send({
        transactionPath: './transactions/test.cdc',
        arguments: [
          { type: 'Address', value: '0x1234567890abcdef' },
          { type: 'UFix64', value: '123.456' },
          { type: 'Array', value: [1, 2, 3] },
        ],
        signer: 'testnet-deployer',
      });

      const call = flowCliService.execute.mock.calls[0][0];
      const argsIndex = call.indexOf('--args-json');
      const argsJson = JSON.parse(call[argsIndex + 1]);

      expect(argsJson).toHaveLength(3);
      expect(argsJson[0].type).toBe('Address');
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      flowCliService.execute.mockRejectedValue(new Error('Network timeout'));

      await expect(
        service.send({
          transactionPath: './transactions/test.cdc',
          arguments: [],
          signer: 'testnet-deployer',
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should handle invalid signer', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: '',
        stderr: 'Error: signer not found',
        exitCode: 1,
      });

      await expect(
        service.send({
          transactionPath: './transactions/test.cdc',
          arguments: [],
          signer: 'invalid-signer',
        })
      ).rejects.toThrow('signer not found');
    });

    it('should handle invalid transaction path', async () => {
      flowCliService.execute.mockResolvedValue({
        stdout: '',
        stderr: 'Error: file not found',
        exitCode: 1,
      });

      await expect(
        service.send({
          transactionPath: './invalid/path.cdc',
          arguments: [],
          signer: 'testnet-deployer',
        })
      ).rejects.toThrow('file not found');
    });
  });
});
