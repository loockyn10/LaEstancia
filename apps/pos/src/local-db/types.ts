export type PosRole = "owner" | "admin" | "staff";

export type LocalAccessContext = {
  userId: string;
  businessId: string;
  businessName: string;
  role: PosRole;
  selectedBranchId: string | null;
  updatedAt: string;
};

export type LocalBranch = {
  businessId: string;
  id: string;
  name: string;
  isActive: boolean;
};

export type LocalProduct = {
  businessId: string;
  id: string;
  name: string;
};

export type LocalVariant = {
  businessId: string;
  id: string;
  productId: string;
  name: string;
  sku: string;
};

export type LocalBarcode = {
  businessId: string;
  code: string;
  variantId: string;
};

export type LocalPrice = {
  businessId: string;
  variantId: string;
  basePriceCents: number | null;
  effectivePriceCents: number;
  offerId: string | null;
};

export type LocalOffer = {
  businessId: string;
  id: string;
  variantId: string;
  promotionalPriceCents: number;
};

export type LocalStock = {
  businessId: string;
  branchId: string;
  variantId: string;
  quantity: number;
};

export type LocalSyncMetadata = {
  businessId: string;
  lastSyncAt: string;
};

export type OperationalSnapshot = {
  businessId: string;
  branches: LocalBranch[];
  products: LocalProduct[];
  variants: LocalVariant[];
  barcodes: LocalBarcode[];
  prices: LocalPrice[];
  offers: LocalOffer[];
  stocks: LocalStock[];
};

export type PosOption = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  barcodes: string[];
  price: number;
  offer: boolean;
  stock: number;
};
