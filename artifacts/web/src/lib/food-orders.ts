export type FoodOrderLine = {
  restaurantId: number;
  restaurantName: string;
  dish: string;
  price: number;
  quantity: number;
};

export type FoodOrder = {
  id: string;
  restaurant: string;
  items: FoodOrderLine[];
  address: string;
  paymentMethod: string;
  total: number;
  status: "confirmed" | "Placed";
  createdAt: string;
};

const FOOD_ORDER_KEY = "cm_food_orders";

export function readFoodOrders(): FoodOrder[] {
  try {
    const orders = JSON.parse(localStorage.getItem(FOOD_ORDER_KEY) || "[]");
    return Array.isArray(orders) ? orders : [];
  } catch {
    return [];
  }
}

export function saveFoodOrder(order: FoodOrder) {
  localStorage.setItem(FOOD_ORDER_KEY, JSON.stringify([order, ...readFoodOrders()].slice(0, 20)));
}
