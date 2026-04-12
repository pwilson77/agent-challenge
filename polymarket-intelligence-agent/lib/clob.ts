import axios from "axios";

export const POLYMARKET_CLOB_URL = "https://clob.polymarket.com";

export interface ClobPricePoint {
  t: number;
  p: number;
}

export async function getClobLastTradePrice(tokenId: string): Promise<number> {
  const response = await axios.get<{ price?: string | number }>(
    `${POLYMARKET_CLOB_URL}/last-trade-price`,
    {
      params: { token_id: tokenId },
      timeout: 12_000,
      headers: { Accept: "application/json" },
    },
  );

  const value = Number(response.data?.price);
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid CLOB last trade price response for token ${tokenId}`,
    );
  }
  return value;
}

export async function getClobPricesHistory(params: {
  tokenId: string;
  startTs?: number;
  endTs?: number;
  fidelity?: number;
  interval?: "max" | "1w" | "1d" | "6h" | "1h";
}): Promise<ClobPricePoint[]> {
  const response = await axios.get<ClobPricePoint[]>(
    `${POLYMARKET_CLOB_URL}/prices-history`,
    {
      params: {
        market: params.tokenId,
        startTs: params.startTs,
        endTs: params.endTs,
        fidelity: params.fidelity,
        interval: params.interval,
      },
      timeout: 15_000,
      headers: { Accept: "application/json" },
    },
  );

  return Array.isArray(response.data) ? response.data : [];
}
