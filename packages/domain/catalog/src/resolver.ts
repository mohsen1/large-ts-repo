import { Catalog, Product, ProductId } from './schema';

export type ProductResolver = (productId: ProductId) => Promise<Product | undefined>;

export const byTenant = (catalogs: Catalog[]) => (tenantId: string): Catalog | undefined =>
  catalogs.find((catalog) => catalog.tenantId === tenantId);

export const bySku = (catalog: Catalog, sku: string): Product | undefined =>
  catalog.products.find((product) => product.sku === sku);

export const updateProduct = (catalog: Catalog, product: Product): Catalog => {
  const products = catalog.products.map((item) => (item.id === product.id ? product : item));
  const exists = catalog.products.some((item) => item.id === product.id);
  return {
    ...catalog,
    products: exists ? products : [...catalog.products, product],
  };
};

export const removeProduct = (catalog: Catalog, productId: ProductId): Catalog => {
  return {
    ...catalog,
    products: catalog.products.filter((product) => product.id !== productId),
  };
};

export const search = (catalog: Catalog, query: string): Product[] => {
  const q = query.toLowerCase();
  return catalog.products.filter((product) => {
    if (product.name.toLowerCase().includes(q)) return true;
    if (product.description?.toLowerCase().includes(q)) return true;
    if (product.sku.toLowerCase().includes(q)) return true;
    return product.tags.some((tag) => tag.toLowerCase().includes(q));
  });
};
