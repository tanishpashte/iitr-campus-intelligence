"use client";

import React, { useState, useEffect } from "react";
import {
  GraduationCap,
  Calendar,
  BookOpen,
  Utensils,
  Bot,
  Send,
  Sparkles,
  Search,
  ChevronRight,
  Activity,
  X,
  User,
  Mail,
  Phone,
  Clock,
  MapPin
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  time?: string;
  isLoading?: boolean;
}

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "ai",
      text: "Hello! I am your IITR Campus Assistant. What would you like to ask?",
      time: "10:00 AM"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeComponent, setActiveComponent] = useState<string | null>(null);
  const [componentData, setComponentData] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Status of the 4 MCP services we actually possess
  const mcpServices = [
    { name: "Academics", description: "Timetables & academic calendars", icon: GraduationCap, color: "text-blue-600 bg-blue-50" },
    { name: "Library", description: "MGCL floor plans, ebooks, & TBLS list", icon: BookOpen, color: "text-cyan-600 bg-cyan-50" },
    { name: "Mess & Canteen", description: "Bhawan daily menu & prices", icon: Utensils, color: "text-amber-600 bg-amber-50" },
    { name: "Thomso Events", description: "Festival schedule & semantic search", icon: Calendar, color: "text-rose-600 bg-rose-50" }
  ];

  // Try to check if backend API is running, and set simulation mode if not
  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((res) => {
        if (!res.ok) throw new Error();
        setIsSimulated(false);
      })
      .catch(() => {
        setIsSimulated(true);
      });
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isLoading) return;

    const userText = chatInput;
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: "user",
      text: userText,
      time: timeString
    };

    const aiPlaceholderId = `msg-${Date.now()}-ai`;
    const aiPlaceholderMsg: Message = {
      id: aiPlaceholderId,
      sender: "ai",
      text: "",
      isLoading: true,
      time: timeString
    };

    setMessages((prev) => [...prev, userMsg, aiPlaceholderMsg]);
    setChatInput("");
    setIsLoading(true);

    try {
      if (isSimulated) {
        // Run simulated backend response logic
        await simulateResponse(userText, aiPlaceholderId);
      } else {
        // Call actual FastAPI server endpoint
        const res = await fetch("http://localhost:8000/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText })
        });

        if (!res.ok) throw new Error("API Server error");

        const data = await res.json();
        
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiPlaceholderId
              ? { ...msg, text: data.response, isLoading: false }
              : msg
          )
        );

        if (data.ui_data && data.ui_data.ui_component && data.ui_data.data) {
          setActiveComponent(data.ui_data.ui_component);
          setComponentData(data.ui_data.data);
        }
      }
    } catch (err) {
      console.warn("Backend unavailable, running simulated responses:", err);
      setIsSimulated(true);
      await simulateResponse(userText, aiPlaceholderId);
    } finally {
      setIsLoading(false);
    }
  };

  // Minimal simulated responses for offline testing
  const simulateResponse = async (text: string, placeholderId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const lower = text.toLowerCase();
    let reply = "";
    let component: string | null = null;
    let data: any = null;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (lower.includes("mess") || lower.includes("menu") || lower.includes("lunch") || lower.includes("food")) {
      reply = "Here is the daily lunch menu for Rajendra Bhawan mess. Let me know if you need canteen budget options instead.";
      component = "mess_menu";
      data = ["Paneer Butter Masala", "Dal Makhani", "Jeera Rice", "Tandoori Roti", "Boondi Raita", "Gulab Jamun"];
    } else if (lower.includes("schedule") || lower.includes("class") || lower.includes("timetable") || lower.includes("today")) {
      reply = "I've fetched your daily timetable classes for today. You have 3 lectures scheduled.";
      component = "daily_schedule";
      data = [
        "Schedule for 2026-06-15 (Monday):",
        "--- Classes (3) ---",
        "⏰ 09:00 AM | CSN-361 (Advanced Algorithms) | Lecture | Room: LHC-102 | Prof: Dr. R. K. Gupta (Batch: CS-A)",
        "⏰ 11:00 AM | CSN-341 (Computer Networks) | Lecture | Room: LHC-105 | Prof: Dr. S. K. Singh (Batch: CS-A)",
        "⏰ 02:00 PM | ECN-203 (Signals & Systems) | Lab | Room: ECE-Lab-2 | Prof: Dr. A. K. Verma (Batch: CS-A)"
      ];
    } else if (lower.includes("thomso") || lower.includes("event") || lower.includes("dance") || lower.includes("singing")) {
      reply = "Found 3 matching Thomso festival events matching your search criteria.";
      component = "events_list";
      data = [
        "Semantic search results for 'thomso':",
        "🎯 [Score: 0.892] Day 1 | Footloose (Solo Dance) | Time: 2:00 PM | Venue: OAT | Category: Competition",
        "🎯 [Score: 0.845] Day 2 | Battle of Bands | Time: 4:00 PM | Venue: Main Stage | Category: Pronite",
        "🎯 [Score: 0.798] Day 3 | Vogue Fashion Show | Time: 6:00 PM | Venue: Convocation Hall | Category: Competition"
      ];
    } else if (lower.includes("library") || lower.includes("book") || lower.includes("physics") || lower.includes("tbls")) {
      reply = "Here are the matching textbooks from the MGCL TBLS (Textbook Bearing Library Scheme) database.";
      component = "tbls_textbooks";
      data = [
        { title: "Introduction to Electrodynamics", author: "David J. Griffiths", edition: "4th Edition" },
        { title: "Concepts of Physics", author: "H.C. Verma", edition: "Vol 1 & 2" },
        { title: "University Physics", author: "Sears and Zemansky", edition: "13th Edition" }
      ];
    } else if (lower.includes("facility") || lower.includes("floor") || lower.includes("locate") || lower.includes("reference")) {
      reply = "Reference Section is located on the First Floor of MGCL. Here are the floor mapping details.";
      component = "library_facility";
      data = "Here are the locations matching 'reference section':\n- **Reference Section**: Located on the **First Floor** in the **West Wing** section.";
    } else {
      reply = "I've checked the campus database, but I couldn't find matching information. You can ask me about mess menus, schedules, Thomso events, or library facilities.";
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === placeholderId
          ? { ...msg, text: reply, isLoading: false }
          : msg
      )
    );
    if (component) {
      setActiveComponent(component);
      setComponentData(data);
    }
  };

  const handleSuggestion = (prompt: string) => {
    setChatInput(prompt);
  };

  // Render the Dynamic UI Panel matching the API's ui_component string
  const renderComponent = () => {
    if (!activeComponent || !componentData) return null;

    switch (activeComponent) {
      case "mess_menu":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Utensils className="h-4 w-4 text-amber-500" /> Hostel Mess Menu
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.isArray(componentData) &&
                componentData.map((item: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-medium text-slate-700">{item}</span>
                  </div>
                ))}
            </div>
          </div>
        );

      case "canteen_menu":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Utensils className="h-4 w-4 text-amber-500" /> Canteen Menu Items (In Budget)
            </h4>
            <div className="divide-y divide-slate-100">
              {Array.isArray(componentData) &&
                componentData.map((item: string, idx: number) => {
                  const parts = item.split(" - ");
                  return (
                    <div key={idx} className="flex justify-between py-3">
                      <span className="text-sm font-medium text-slate-700">{parts[0]}</span>
                      <span className="text-sm font-semibold text-indigo-600">{parts[1] || ""}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        );

      case "daily_schedule":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-500" /> Daily Schedule & Classes
            </h4>
            <div className="space-y-4">
              {Array.isArray(componentData) &&
                componentData
                  .filter((item: string) => item.includes("⏰"))
                  .map((item: string, idx: number) => {
                    // Extract fields from string
                    const clean = item.replace("⏰ ", "");
                    const parts = clean.split(" | ");
                    return (
                      <div key={idx} className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 items-start">
                        <div className="px-2.5 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold shrink-0">
                          {parts[0]}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">{parts[1]}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>{parts[2]}</span>
                            <span>•</span>
                            <span>{parts[3]}</span>
                            <span>•</span>
                            <span>{parts[4]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              {Array.isArray(componentData) && componentData.length === 0 && (
                <p className="text-sm text-slate-500 py-2">No classes scheduled for today.</p>
              )}
            </div>
          </div>
        );

      case "events_list":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-rose-500" /> Thomso Festival Search Results
            </h4>
            <div className="space-y-3">
              {Array.isArray(componentData) &&
                componentData
                  .filter((item: string) => item.includes("🎯"))
                  .map((item: string, idx: number) => {
                    // Parse: 🎯 [Score: 0.892] Day 1 | Footloose (Solo Dance) | Time: 2:00 PM | Venue: OAT | Category: Competition
                    const clean = item.replace(/🎯\s*\[Score:\s*[\d.]+\]\s*/, "");
                    const parts = clean.split(" | ");
                    return (
                      <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex justify-between items-start">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                            {parts[0]}
                          </span>
                          <h5 className="font-bold text-slate-800 text-sm mt-1.5">{parts[1]}</h5>
                          <div className="flex gap-3 text-xs text-slate-400 mt-1">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {parts[2]?.replace("Time: ", "")}</span>
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {parts[3]?.replace("Venue: ", "")}</span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {parts[4]?.replace("Category: ", "")}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>
        );

      case "tbls_textbooks":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-cyan-500" /> Textbook Results (TBLS)
            </h4>
            <div className="divide-y divide-slate-100">
              {Array.isArray(componentData) &&
                componentData.map((book: any, idx: number) => (
                  <div key={idx} className="py-3.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-bold text-slate-800">{book.title || book.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Author: {book.author} | Edition: {book.edition}</p>
                  </div>
                ))}
            </div>
          </div>
        );

      case "library_facility":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-cyan-500" /> Library Facility Location
            </h4>
            <div className="prose prose-slate text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {typeof componentData === "string" ? componentData : JSON.stringify(componentData)}
            </div>
          </div>
        );

      case "library_staff":
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-cyan-500" /> Library Staff Contacts
            </h4>
            <div className="grid grid-cols-1 gap-4">
              {Array.isArray(componentData) &&
                componentData.map((staff: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <User className="h-4 w-4 text-slate-400" /> {staff.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{staff.designation}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-indigo-600">
                      {staff.emails?.map((email: string, i: number) => (
                        <a key={i} href={`mailto:${email}`} className="flex items-center gap-1 hover:underline">
                          <Mail className="h-3 w-3" /> {email}
                        </a>
                      ))}
                      {staff.phones?.map((phone: string, i: number) => (
                        <span key={i} className="flex items-center gap-1 text-slate-500">
                          <Phone className="h-3 w-3" /> {phone}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Response Data ({activeComponent})
            </h4>
            <pre className="text-xs text-slate-600 bg-slate-50 p-4 rounded-xl overflow-x-auto">
              {JSON.stringify(componentData, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans">
      {/* LEFT/CENTER: DASHBOARD WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200/80 bg-white flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">IITR Campus Intelligence</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Dashboard Workspace</p>
            </div>
          </div>

          {/* <div className="flex items-center gap-3">
            <div className="flex gap-2 items-center text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-500 font-medium hidden sm:inline">MCP Core Connection Active</span>
            </div>
            {isSimulated && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                Simulated API
              </span>
            )}
          </div> */}
        </header>

        {/* Dynamic Canvas Workspace */}
        <main className="flex-1 overflow-y-auto p-8 max-w-4xl w-full mx-auto space-y-6">
          {activeComponent ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Workspace View</span>
                <button
                  onClick={() => {
                    setActiveComponent(null);
                    setComponentData(null);
                  }}
                  className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/60 border border-rose-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" /> Clear View
                </button>
              </div>
              {renderComponent()}
            </div>
          ) : (
            <div className="py-12 space-y-12">
              {/* Clean Minimal Greeting */}
              <div className="text-center max-w-xl mx-auto space-y-3">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Intelligent Campus Hub
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Connect to your campus resources in real-time. Ask the AI assistant on the right about timetables, events, mess, or library resources.
                </p>
              </div>

              {/* Minimal Services Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {mcpServices.map((svc, i) => {
                  const Icon = svc.icon;
                  return (
                    <div
                      key={i}
                      className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 flex items-start gap-4"
                    >
                      <span className={`p-2.5 rounded-xl shrink-0 ${svc.color}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900">{svc.name}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">{svc.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Minimal Suggestion Prompts */}
              <div className="space-y-3 max-w-xl mx-auto">
                <p className="text-xs text-center font-bold text-slate-400 uppercase tracking-wider">Suggested Queries</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "What's on the menu for lunch today?",
                    "What is my daily schedule for today?",
                    "Search Thomso events for singing",
                    "Search library books for Physics"
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestion(prompt)}
                      className="text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 py-2 px-3.5 rounded-full transition-all duration-200 cursor-pointer shadow-sm"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* RIGHT: AI ASSISTANT PANEL */}
      <aside className="w-96 border-l border-slate-200 bg-white flex flex-col h-full shrink-0 shadow-lg shadow-slate-100/30">
        {/* Header: A simple container displaying an avatar icon and title */}
        <div className="h-16 border-b border-slate-200/80 flex items-center justify-between px-4 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-slate-600 text-white rounded-lg">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                Campus Intelligence Brain
              </h2>
              <p className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
                {isLoading ? "Thinking..." : "Ready"}
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </span>
        </div>

        {/* Message Timeline: A scrollable middle pane */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/15">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${
                msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
              }`}
            >
              <div
                className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  msg.sender === "user"
                    ? "bg-slate-600 text-white rounded-tr-none"
                    : "bg-white border border-slate-200/60 text-slate-800 rounded-tl-none"
                }`}
              >
                {msg.isLoading ? (
                  <div className="flex gap-1 items-center py-1">
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
              {msg.time && (
                <span className="text-[9px] text-slate-400 mt-1 px-1 font-medium">{msg.time}</span>
              )}
            </div>
          ))}
        </div>

        {/* Input Dock: A fixed footer container holding input and Send button */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0">
          <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isLoading}
              placeholder="Ask me anything..."
              className="flex-1 bg-slate-100 hover:bg-slate-100/80 focus:bg-slate-50 disabled:bg-slate-50 text-xs py-3 px-4 pr-12 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-600/20 border-none transition-all duration-200"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isLoading}
              className="absolute right-2 p-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl transition-all duration-200 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="text-[9px] text-slate-400 font-medium">IITR Intelligent Assistant</span>
          </div>
        </div>
      </aside>
    </div>
  );
}



