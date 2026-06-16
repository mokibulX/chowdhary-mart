import React, { useState, useEffect } from "react";
import {
  MapPin,
  Search,
  ShoppingCart,
  User,
  Globe,
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
  Zap,
  Facebook,
  Twitter,
  Instagram,
  Youtube
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function Desktop() {
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 45, seconds: 30 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else {
          seconds = 59;
          if (minutes > 0) {
            minutes--;
          } else {
            minutes = 59;
            if (hours > 0) {
              hours--;
            }
          }
        }
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (time: number) => time.toString().padStart(2, '0');

  const categories = [
    { name: "Grocery", icon: <ShoppingCart className="w-5 h-5" />, color: "bg-orange-100 text-orange-600" },
    { name: "Electronics", icon: <Smartphone className="w-5 h-5" />, color: "bg-blue-100 text-blue-600" },
    { name: "Fashion", icon: <Shirt className="w-5 h-5" />, color: "bg-pink-100 text-pink-600" },
    { name: "Mobiles", icon: <Headphones className="w-5 h-5" />, color: "bg-purple-100 text-purple-600" },
    { name: "Appliances", icon: <Home className="w-5 h-5" />, color: "bg-green-100 text-green-600" },
    { name: "Furniture", icon: <Sofa className="w-5 h-5" />, color: "bg-yellow-100 text-yellow-600" },
    { name: "Beauty", icon: <Sparkles className="w-5 h-5" />, color: "bg-rose-100 text-rose-600" },
    { name: "Pharmacy", icon: <Pill className="w-5 h-5" />, color: "bg-teal-100 text-teal-600" },
    { name: "Vegetables", icon: <Carrot className="w-5 h-5" />, color: "bg-emerald-100 text-emerald-600" },
    { name: "Stationery", icon: <Book className="w-5 h-5" />, color: "bg-indigo-100 text-indigo-600" },
  ];

  const flashSaleProducts = [
    { name: "Amul Taaza Milk 500ml", price: 25, originalPrice: 28, discount: 10, image: "/__mockup/images/vegetables.png", weight: "500 ml" },
    { name: "Tata Salt Vacuum Evaporated", price: 22, originalPrice: 28, discount: 21, image: "/__mockup/images/vegetables.png", weight: "1 kg" },
    { name: "OnePlus Nord Buds 2", price: 2999, originalPrice: 3299, discount: 9, image: "/__mockup/images/smartphone.png", weight: "1 unit" },
    { name: "Colgate MaxFresh Red", price: 154, originalPrice: 180, discount: 14, image: "/__mockup/images/vegetables.png", weight: "150 g" },
  ];

  const trendingProducts = [
    { name: "Samsung Galaxy M14 5G", price: 14990, rating: 4.3, image: "/__mockup/images/smartphone.png" },
    { name: "Fresh Tomatoes - Local", price: 45, rating: 4.6, image: "/__mockup/images/vegetables.png" },
    { name: "Aashirvaad Shudh Chakki Atta", price: 245, rating: 4.8, image: "/__mockup/images/vegetables.png" },
    { name: "Dove Cream Beauty Bathing Bar", price: 260, rating: 4.5, image: "/__mockup/images/vegetables.png" },
    { name: "Maggi 2-Minute Noodles", price: 140, rating: 4.7, image: "/__mockup/images/vegetables.png" },
    { name: "Sony 43 inch 4K Ultra HD TV", price: 41990, rating: 4.4, image: "/__mockup/images/smartphone.png" },
    { name: "Surf Excel Body Wash", price: 180, rating: 4.2, image: "/__mockup/images/vegetables.png" },
    { name: "Fresh Onions", price: 35, rating: 4.5, image: "/__mockup/images/vegetables.png" },
  ];

  const nearbyStores = [
    { name: "Gupta General Store", distance: "1.2 km", time: "15 mins", rating: 4.2, status: "Open" },
    { name: "Sharma Electronics", distance: "2.5 km", time: "25 mins", rating: 4.5, status: "Open" },
    { name: "Apollo Pharmacy", distance: "0.8 km", time: "10 mins", rating: 4.8, status: "Open" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans w-full max-w-[1440px] mx-auto overflow-hidden">
      {/* Top Navbar */}
      <header className="bg-blue-900 text-white sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="bg-orange-500 p-2 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">Chowdhary Mart</h1>
              <span className="text-[10px] text-blue-200 uppercase tracking-wider font-semibold">India's Neighborhood Store</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-blue-800/50 hover:bg-blue-800 transition-colors px-3 py-2 rounded-md cursor-pointer border border-blue-700/50">
            <MapPin className="w-5 h-5 text-orange-400" />
            <div className="flex flex-col">
              <span className="text-xs text-blue-200">Deliver in 12 mins</span>
              <div className="flex items-center gap-1 text-sm font-semibold">
                <span>Sector 15, Noida</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-2xl relative">
            <input
              type="text"
              placeholder="Search for groceries, electronics, fashion and more..."
              className="w-full pl-4 pr-12 py-2.5 rounded-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-inner"
            />
            <button className="absolute right-0 top-0 h-full px-4 bg-orange-500 hover:bg-orange-600 rounded-r-sm transition-colors flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 cursor-pointer hover:text-orange-300 transition-colors">
              <Globe className="w-5 h-5" />
              <span className="text-sm font-medium">EN</span>
              <ChevronDown className="w-4 h-4" />
            </div>
            
            <div className="flex items-center gap-2 cursor-pointer hover:text-orange-300 transition-colors">
              <User className="w-5 h-5" />
              <span className="text-sm font-medium">Login</span>
            </div>

            <div className="flex items-center gap-2 cursor-pointer bg-blue-800 px-4 py-2 rounded-md hover:bg-blue-700 transition-colors border border-blue-700">
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  3
                </span>
              </div>
              <span className="text-sm font-semibold">₹429</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-16">
        {/* Promotional Banner Carousel */}
        <section className="container mx-auto px-4 py-6">
          <div className="relative rounded-xl overflow-hidden shadow-lg h-[320px] bg-slate-200 group">
            <img 
              src="/__mockup/images/chowdhary-banner.png" 
              alt="Grocery Deals Banner" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/80 to-transparent flex items-center">
              <div className="pl-12 max-w-lg text-white">
                <Badge className="bg-orange-500 hover:bg-orange-600 text-white mb-4 px-3 py-1 text-sm font-bold border-none uppercase tracking-wider">Maha Bachat Sale</Badge>
                <h2 className="text-5xl font-black mb-4 leading-tight">Up to 50% Off on Monthly Groceries</h2>
                <p className="text-lg text-blue-100 mb-6 font-medium">Plus extra 10% cashback on HDFC cards</p>
                <Button className="bg-white text-blue-900 hover:bg-blue-50 font-bold px-8 py-6 text-lg rounded-full shadow-lg transition-transform hover:scale-105">Shop Now</Button>
              </div>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <div className="w-8 h-2 rounded-full bg-white"></div>
              <div className="w-2 h-2 rounded-full bg-white/50"></div>
              <div className="w-2 h-2 rounded-full bg-white/50"></div>
            </div>
          </div>
        </section>

        {/* Category Icons Row */}
        <section className="container mx-auto px-4 py-4 mb-6 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {categories.map((cat, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 min-w-[80px] cursor-pointer group">
                <div className={`w-16 h-16 rounded-2xl ${cat.color} flex items-center justify-center shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1`}>
                  {cat.icon}
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-blue-900">{cat.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Flash Sale Countdown */}
        <section className="container mx-auto px-4 mb-10">
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-6 shadow-sm border border-orange-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-orange-600 bg-orange-200/50 px-3 py-1.5 rounded-lg">
                  <Zap className="w-6 h-6 fill-current" />
                  <h3 className="text-2xl font-bold">Flash Deals</h3>
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <span>Ends in</span>
                  <div className="flex gap-1">
                    <span className="bg-slate-800 text-white px-2 py-1 rounded text-sm font-mono">{formatTime(timeLeft.hours)}</span>
                    <span>:</span>
                    <span className="bg-slate-800 text-white px-2 py-1 rounded text-sm font-mono">{formatTime(timeLeft.minutes)}</span>
                    <span>:</span>
                    <span className="bg-slate-800 text-white px-2 py-1 rounded text-sm font-mono">{formatTime(timeLeft.seconds)}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" className="text-orange-600 hover:text-orange-700 hover:bg-orange-200 font-semibold">View All Deals</Button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {flashSaleProducts.map((product, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 min-w-[240px] flex flex-col relative border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <Badge className="absolute top-2 left-2 bg-red-500 hover:bg-red-600 text-white border-none">{product.discount}% OFF</Badge>
                  <div className="h-32 mb-4 flex items-center justify-center p-2">
                    <img src={product.image} alt={product.name} className="max-h-full object-contain mix-blend-multiply" />
                  </div>
                  <h4 className="font-medium text-slate-800 line-clamp-2 mb-1 text-sm">{product.name}</h4>
                  <span className="text-xs text-slate-500 mb-2">{product.weight}</span>
                  <div className="mt-auto flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-slate-900">₹{product.price}</div>
                      <div className="text-xs text-slate-400 line-through">₹{product.originalPrice}</div>
                    </div>
                    <Button size="sm" className="bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200">Add</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Offers Banner */}
        <section className="container mx-auto px-4 mb-10">
          <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-xl p-4 shadow-md flex items-center justify-center text-center overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 text-white">
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-widest">New User</span>
              <p className="text-lg md:text-xl font-medium">First delivery <span className="font-bold text-yellow-300">FREE</span> on orders above ₹299</p>
              <div className="hidden md:block w-px h-6 bg-blue-700"></div>
              <div className="flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full border border-white/20 border-dashed backdrop-blur-sm">
                <span className="text-sm">Use code:</span>
                <span className="font-mono font-bold tracking-wider text-yellow-300">CHOW10</span>
                <span className="text-sm">for 10% off</span>
              </div>
            </div>
          </div>
        </section>

        {/* Nearby Stores Section */}
        <section className="container mx-auto px-4 mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-orange-500" />
              Stores Near You <span className="text-sm font-normal text-slate-500 ml-2">(within 5km)</span>
            </h3>
            <Button variant="outline" className="text-blue-700 border-blue-200 hover:bg-blue-50">See Map</Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {nearbyStores.map((store, idx) => (
              <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-start gap-4 cursor-pointer group">
                <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center text-blue-700 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <StoreIcon className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-bold text-slate-800">{store.name}</h4>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{store.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600 mb-2">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400"/> {store.distance}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400"/> {store.time}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-orange-400 text-orange-400" />
                    <span className="text-sm font-medium text-slate-700">{store.rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Product Grid — Trending Now */}
        <section className="container mx-auto px-4 mb-12">
          <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            Trending Now
            <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full uppercase tracking-wider font-bold">Hot</span>
          </h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
            {trendingProducts.map((product, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-lg transition-all group flex flex-col">
                <div className="h-40 mb-4 bg-slate-50 rounded-lg p-4 relative overflow-hidden">
                  <img src={product.image} alt={product.name} className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" />
                  <button className="absolute top-2 right-2 p-1.5 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <HeartIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  <Badge variant="secondary" className="bg-green-50 text-green-700 text-[10px] px-1.5 py-0 border-green-100 flex items-center gap-0.5">
                    {product.rating} <Star className="w-3 h-3 fill-current" />
                  </Badge>
                  <span className="text-xs text-slate-400">(1.2k)</span>
                </div>
                <h4 className="font-medium text-slate-800 line-clamp-2 text-sm mb-4 h-10">{product.name}</h4>
                <div className="mt-auto flex items-end justify-between">
                  <div className="text-lg font-bold text-slate-900">₹{product.price}</div>
                  <Button size="sm" className="bg-blue-900 hover:bg-blue-800 text-white rounded-md shadow-sm">
                    Add to Cart
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Category Sections: Grocery Essentials */}
        <section className="container mx-auto px-4 mb-10">
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-2">
            <h3 className="text-xl font-bold text-slate-800">Grocery Essentials</h3>
            <Button variant="link" className="text-blue-700 font-medium p-0 h-auto">View All</Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
             {trendingProducts.slice(1, 5).map((product, idx) => (
                <div key={idx} className="bg-white rounded-xl p-4 min-w-[220px] max-w-[220px] border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col">
                  <div className="h-32 mb-3 bg-slate-50 rounded-lg p-3">
                    <img src={product.image} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
                  </div>
                  <h4 className="font-medium text-slate-800 line-clamp-2 text-sm mb-2 flex-1">{product.name}</h4>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="font-bold text-slate-900">₹{product.price}</div>
                    <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50 font-semibold px-4">Add</Button>
                  </div>
                </div>
              ))}
          </div>
        </section>

         {/* Category Sections: Electronics */}
         <section className="container mx-auto px-4 mb-16">
          <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-2">
            <h3 className="text-xl font-bold text-slate-800">Electronics & Accessories</h3>
            <Button variant="link" className="text-blue-700 font-medium p-0 h-auto">View All</Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
             {trendingProducts.slice(0, 4).map((product, idx) => (
                <div key={idx} className="bg-white rounded-xl p-4 min-w-[220px] max-w-[220px] border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col">
                  <div className="h-32 mb-3 bg-slate-50 rounded-lg p-3">
                    <img src={product.image} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
                  </div>
                  <h4 className="font-medium text-slate-800 line-clamp-2 text-sm mb-2 flex-1">{product.name}</h4>
                  <div className="flex items-center justify-between mt-auto">
                    <div className="font-bold text-slate-900">₹{product.price}</div>
                    <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50 font-semibold px-4">Add</Button>
                  </div>
                </div>
              ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 pt-16 pb-8 border-t-4 border-orange-500">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="bg-orange-500 p-1.5 rounded-lg inline-block">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Chowdhary Mart</h2>
              </div>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                India's favorite neighborhood shopping platform. From fresh vegetables to latest electronics, delivered to your doorstep in minutes.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors"><Facebook className="w-5 h-5" /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-blue-400 hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-pink-600 hover:text-white transition-colors"><Instagram className="w-5 h-5" /></a>
                <a href="#" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"><Youtube className="w-5 h-5" /></a>
              </div>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Categories</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-orange-400 transition-colors">Grocery & Staples</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Mobiles & Electronics</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Fashion & Lifestyle</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Home & Appliances</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Pharmacy & Wellness</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Customer Service</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="hover:text-orange-400 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Terms & Conditions</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Return Policy</a></li>
                <li><a href="#" className="hover:text-orange-400 transition-colors">Help & Support</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 uppercase tracking-wider text-sm">Download App</h4>
              <p className="text-sm text-slate-400 mb-4">Get the Chowdhary Mart app for exclusive offers and faster checkout.</p>
              <div className="space-y-3">
                <Button className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white h-12 border border-slate-700">
                  <div className="flex flex-col items-start ml-2">
                    <span className="text-[10px] text-slate-400 uppercase leading-none mb-1">Download on the</span>
                    <span className="font-semibold leading-none">App Store</span>
                  </div>
                </Button>
                <Button className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white h-12 border border-slate-700">
                  <div className="flex flex-col items-start ml-2">
                    <span className="text-[10px] text-slate-400 uppercase leading-none mb-1">GET IT ON</span>
                    <span className="font-semibold leading-none">Google Play</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
            <p>© 2026 Chowdhary Mart. All rights reserved.</p>
            <div className="mt-4 md:mt-0">
              <span className="mr-4">A hyper-local commerce initiative.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Simple icons to avoid missing imports
function StoreIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  );
}

function HeartIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}
