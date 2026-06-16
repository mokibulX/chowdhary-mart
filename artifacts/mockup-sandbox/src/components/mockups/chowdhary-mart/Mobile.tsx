import React from "react";
import {
  MapPin,
  Search,
  ShoppingCart,
  ChevronDown,
  ShoppingBag,
  Smartphone,
  Shirt,
  Headphones,
  Home,
  Sofa,
  Sparkles,
  Pill,
  Carrot,
  Book,
  Clock,
  Star,
  Home as HomeIcon,
  LayoutGrid,
  FileText,
  User,
  Zap,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function Mobile() {
  const categories = [
    { name: "Vegetables", icon: <Carrot className="w-5 h-5 text-emerald-600" />, color: "bg-emerald-100" },
    { name: "Mobiles", icon: <Smartphone className="w-5 h-5 text-blue-600" />, color: "bg-blue-100" },
    { name: "Pharmacy", icon: <Pill className="w-5 h-5 text-teal-600" />, color: "bg-teal-100" },
    { name: "Grocery", icon: <ShoppingCart className="w-5 h-5 text-orange-600" />, color: "bg-orange-100" },
    { name: "Fashion", icon: <Shirt className="w-5 h-5 text-pink-600" />, color: "bg-pink-100" },
    { name: "Beauty", icon: <Sparkles className="w-5 h-5 text-rose-600" />, color: "bg-rose-100" },
    { name: "Stationery", icon: <Book className="w-5 h-5 text-indigo-600" />, color: "bg-indigo-100" },
    { name: "Electronics", icon: <Headphones className="w-5 h-5 text-purple-600" />, color: "bg-purple-100" },
  ];

  const topPicks = [
    { name: "Tata Salt Vacuum Evaporated", price: 22, weight: "1 kg", image: "/__mockup/images/vegetables.png" },
    { name: "Amul Taaza Milk 500ml", price: 25, weight: "500 ml", image: "/__mockup/images/vegetables.png" },
    { name: "OnePlus Nord Buds 2", price: 2999, weight: "1 unit", image: "/__mockup/images/smartphone.png" },
  ];

  const groceryPicks = [
    { name: "Aashirvaad Atta", price: 245, weight: "5 kg", image: "/__mockup/images/vegetables.png" },
    { name: "Maggi Noodles", price: 140, weight: "12 pack", image: "/__mockup/images/vegetables.png" },
    { name: "Colgate MaxFresh", price: 154, weight: "150 g", image: "/__mockup/images/vegetables.png" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans w-full max-w-[390px] mx-auto overflow-hidden flex flex-col relative border-x border-slate-200 shadow-xl">
      
      {/* Mobile Header */}
      <header className="bg-white pt-4 pb-3 px-4 sticky top-0 z-50 rounded-b-2xl shadow-sm border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-900 p-2 rounded-lg shrink-0">
              <ShoppingBag className="w-5 h-5 text-orange-500" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1 cursor-pointer">
                <span className="font-bold text-slate-800 text-lg">Sector 15, Noida</span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </div>
              <span className="text-xs text-slate-500 font-medium">Chowdhary Mart</span>
            </div>
          </div>
          <div className="relative p-2 bg-slate-100 rounded-full cursor-pointer">
            <ShoppingCart className="w-5 h-5 text-slate-700" />
            <span className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
              3
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search for atta, dal, soap..."
            className="w-full bg-slate-100 border-none pl-10 pr-4 py-3 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all placeholder:text-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 scrollbar-hide">
        {/* Delivery Promise */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 flex items-center justify-center text-white text-sm font-bold shadow-sm">
          <Zap className="w-4 h-4 mr-1.5 fill-white" />
          Delivery in 12 minutes
        </div>

        {/* Today's Deals Banner */}
        <div className="px-4 py-4">
          <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-orange-500/20 rounded-full blur-2xl"></div>
            
            <div className="relative z-10 flex flex-col items-start">
              <Badge className="bg-orange-500 hover:bg-orange-600 border-none text-white text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 mb-2">Deal of the Day</Badge>
              <h2 className="text-2xl font-black mb-1 leading-tight text-yellow-300">FLAT 50% OFF</h2>
              <p className="text-sm text-blue-100 mb-4 font-medium">On monthly groceries & more</p>
              <Button size="sm" className="bg-white text-blue-900 hover:bg-slate-100 rounded-full px-6 font-bold shadow-sm">
                Shop Now
              </Button>
            </div>
            
            <img src="/__mockup/images/chowdhary-banner.png" alt="Groceries" className="absolute right-0 bottom-0 w-28 h-28 object-cover opacity-60 mix-blend-luminosity mask-image-gradient" style={{ maskImage: 'linear-gradient(to left, black, transparent)' }} />
          </div>
        </div>

        {/* Category Grid */}
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-lg">What do you need?</h3>
          </div>
          <div className="grid grid-cols-4 gap-y-4 gap-x-2">
            {categories.map((cat, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5 cursor-pointer">
                <div className={`w-14 h-14 rounded-2xl ${cat.color} flex items-center justify-center shadow-sm`}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-semibold text-slate-700 text-center leading-tight tracking-tight">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product Horizontal Scroll — Top Picks */}
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-lg">Top Picks For You</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            {topPicks.map((product, idx) => (
              <div key={idx} className="bg-white rounded-xl p-3 min-w-[130px] max-w-[130px] border border-slate-100 shadow-sm flex flex-col relative shrink-0">
                <div className="h-20 mb-2 p-1 flex items-center justify-center">
                  <img src={product.image} alt={product.name} className="max-h-full object-contain mix-blend-multiply" />
                </div>
                <div className="text-[10px] text-slate-500 mb-1 bg-slate-100 w-max px-1.5 py-0.5 rounded">{product.weight}</div>
                <h4 className="font-medium text-slate-800 line-clamp-2 text-xs mb-3 flex-1 leading-snug">{product.name}</h4>
                <div className="flex items-center justify-between mt-auto">
                  <div className="font-bold text-slate-900 text-sm">₹{product.price}</div>
                  <button className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Special Offer Strip */}
        <div className="px-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
            <div className="bg-yellow-100 p-2 rounded-lg">
              <Zap className="w-5 h-5 text-yellow-600 fill-yellow-600" />
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm">Free Delivery Available</div>
              <div className="text-xs text-slate-600">Add ₹149 more to get free delivery</div>
            </div>
          </div>
        </div>

        {/* Category Sections: Grocery */}
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-lg">Daily Grocery</h3>
            <span className="text-xs font-bold text-orange-600">See all</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {groceryPicks.map((product, idx) => (
              <div key={idx} className="bg-white rounded-xl p-2 border border-slate-100 shadow-sm flex flex-col">
                <div className="h-16 mb-2 p-1 flex items-center justify-center">
                  <img src={product.image} alt={product.name} className="max-h-full object-contain mix-blend-multiply" />
                </div>
                <h4 className="font-medium text-slate-800 line-clamp-2 text-[10px] mb-1 flex-1 leading-tight">{product.name}</h4>
                <div className="text-[9px] text-slate-500 mb-2">{product.weight}</div>
                <div className="font-bold text-slate-900 text-xs mb-1">₹{product.price}</div>
                <button className="w-full py-1.5 rounded-md bg-orange-50 text-orange-600 text-xs font-bold border border-orange-200">
                  ADD
                </button>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* Bottom Tab Bar */}
      <nav className="bg-white border-t border-slate-100 px-6 py-2 pb-safe absolute bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col items-center gap-1 cursor-pointer">
            <HomeIcon className="w-6 h-6 text-blue-900" />
            <span className="text-[10px] font-bold text-blue-900">Home</span>
          </div>
          <div className="flex flex-col items-center gap-1 cursor-pointer">
            <LayoutGrid className="w-6 h-6 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">Categories</span>
          </div>
          <div className="flex flex-col items-center gap-1 cursor-pointer relative">
            <div className="absolute -top-1 -right-1 bg-red-500 w-2 h-2 rounded-full border border-white"></div>
            <FileText className="w-6 h-6 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">Orders</span>
          </div>
          <div className="flex flex-col items-center gap-1 cursor-pointer">
            <User className="w-6 h-6 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-400">Account</span>
          </div>
        </div>
      </nav>
    </div>
  );
}
