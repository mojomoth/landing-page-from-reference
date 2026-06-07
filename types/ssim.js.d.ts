declare module "ssim.js" {
  interface MSSIM {
    mssim: number;
  }
  export function ssim(
    a: { data: Uint8ClampedArray | Buffer; width: number; height: number },
    b: { data: Uint8ClampedArray | Buffer; width: number; height: number },
    options?: Record<string, unknown>,
  ): MSSIM;
}
