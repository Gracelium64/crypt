declare module "qrcode" {
  const toDataURL: (text: string, opts?: any) => Promise<string>;
  export { toDataURL };
  export default { toDataURL };
}
