declare module "@onflow/fcl" {
  export function config(): {
    put(key: string, value: unknown): ReturnType<typeof config>;
  };

  export function tx(id: string): {
    onceSealed(): Promise<{
      status: number;
      statusCode: number;
      errorMessage?: string | null;
      events?: Array<{
        type: string;
        data?: unknown;
        payload?: unknown;
      }>;
    }>;
  };

  export function mutate(options: {
    cadence: string;
    args?: (arg: (value: unknown, type: unknown) => unknown, t: Record<string, unknown>) => unknown[];
    limit?: number;
  }): Promise<string>;

  export function query<T = unknown>(options: {
    cadence: string;
    args?: (arg: (value: unknown, type: unknown) => unknown, t: Record<string, unknown>) => unknown[];
  }): Promise<T>;

  export function arg(value: unknown, type: unknown): unknown;

  export const t: Record<string, unknown> & {
    Address: unknown;
    String: unknown;
  };
}
