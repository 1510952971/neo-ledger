type Snapshot = Record<string, unknown>;
type OperationResult<T> = { response: Response; data: T | null };

export type NearbyPackageWorkflowResult = {
  pairingCode: string;
  payload: string;
  fileName: string;
};

export async function createNearbyPackageWorkflow(input: {
  exportSnapshot: () => Promise<OperationResult<Snapshot>>;
  makePairingCode: () => string;
  encrypt: (snapshot: Snapshot, secret: string) => Promise<string>;
  now?: Date;
}): Promise<NearbyPackageWorkflowResult> {
  const exported = await input.exportSnapshot();
  if (
    !exported.response.ok ||
    !exported.data ||
    typeof exported.data !== "object" ||
    Array.isArray(exported.data)
  )
    throw new Error("读取本地账本失败");
  const pairingCode = input.makePairingCode();
  const payload = await input.encrypt(exported.data, `nearby:${pairingCode}`);
  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  return {
    pairingCode,
    payload,
    fileName: `neo-ledger-nearby-${date}.e2ee.json`,
  };
}
