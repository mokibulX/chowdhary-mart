type StoreLike = Record<string, any>;

// Keep seller ownership, contact, financial and operational controls private.
// Customers only need the public shop identity and storefront presentation.
export function toPublicStore(store: StoreLike | null | undefined) {
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    description: store.description,
    logoUrl: store.logoUrl,
    bannerUrl: store.bannerUrl,
    address: store.address,
    city: store.city,
    pincode: store.pincode,
    rating: store.rating,
    ratingCount: store.ratingCount,
    isOpen: store.isOpen,
    isVerified: store.isVerified,
    isActive: store.isActive,
  };
}
