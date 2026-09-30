declare module "heic-decode" {
  const decode: {
    all(options: {
      buffer: Buffer;
    }): Promise<Array<{ width: number; height: number }> & { dispose(): void }>;
  };
  export default decode;
}
