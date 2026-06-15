"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
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
  MapPin,
  AlertCircle,
  CheckCircle2
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
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [initData, setInitData] = useState<any>(null);
  const [activeMealView, setActiveMealView] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 10) return "breakfast";
    if (hour < 15) return "lunch";
    return "dinner";
  });
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Status of the 4 MCP services we actually possess
  const mcpServices = [
    { name: "Academics", description: "Timetables & academic calendars", icon: GraduationCap, color: "text-blue-600 bg-blue-50" },
    { name: "Library", description: "MGCL floor plans, ebooks, & TBLS list", icon: BookOpen, color: "text-cyan-600 bg-cyan-50" },
    { name: "Mess & Canteen", description: "Bhawan daily menu & prices", icon: Utensils, color: "text-amber-600 bg-amber-50" },
    { name: "Thomso Events", description: "Festival schedule & semantic search", icon: Calendar, color: "text-rose-600 bg-rose-50" }
  ];

  const simulatedInitData = {
    ui_data: {
      type: "mess_menu",
      data: {
        breakfast: ["Paneer Paratha", "Butter/Jam", "Boiled Egg/Banana", "Milk/Tea"],
        lunch: ["Kadhai Paneer", "Dal Fry", "Plain Rice", "Butter Roti", "Cucumber Salad", "Ice Cream"],
        dinner: ["Chana Masala", "Aloo Matar Curry", "Palak Puri", "Rice", "Rice kheer with Dry Fruits"],
        active_meal: "dinner"
      }
    },
    academics: {
      timetable: [
        {
          time: "09.00-09.55",
          type: "Lecture",
          course_code: "HSS-302",
          batch: "Batch 1",
          professor: "Anindya Jayanta Mishra",
          room_no: "APJ AKB-101",
          course_name: "Social Studies of Science"
        },
        {
          time: "14.00-14.55",
          type: "Lecture",
          course_code: "MIL-310",
          batch: "Batch 1",
          professor: "Pradeep Kumar",
          room_no: "APJ AKB-001",
          course_name: "Quality Management"
        },
        {
          time: "15.00-15.55",
          type: "Lecture",
          course_code: "MIC-302",
          batch: "Batch 1 (P11, P12)",
          professor: "Bhanu Mishra, Vidit Gaur",
          room_no: "APJ AKB-001",
          course_name: "Machine Design"
        },
        {
          time: "16.05-17.00",
          type: "Lecture",
          course_code: "MIL-335",
          batch: "Batch 1",
          professor: "Akshay Dvivedi",
          room_no: "APJ AKB-003",
          course_name: "Concurrent Engineering"
        }
      ],
      calendar: {
        chronological_schedule: [
          {
            details: "Orientation Program - Newly Admitted UG Students",
            start_date: "2026-07-25",
            end_date: "2026-07-26",
            days: ["Saturday", "Sunday"]
          }
        ],
        time_table_rescheduling: [],
        official_holidays: []
      }
    }
  };

  // Try to check if backend API is running, and set simulation mode if not
  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((res) => {
        if (!res.ok) throw new Error();
        setIsSimulated(false);
        return fetch("http://localhost:8000/api/dashboard/init");
      })
      .then((res) => {
        if (res && res.ok) return res.json();
      })
      .then((data) => {
        if (data && data.academics && data.ui_data) {
          setInitData(data);
        } else {
          setInitData(simulatedInitData);
        }
      })
      .catch(() => {
        setIsSimulated(true);
        setInitData(simulatedInitData);
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

        if (data.ui_data) {
          setDashboardData(data.ui_data);
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
      setDashboardData({
        type: component,
        data: data
      });
    }
  };

  const handleSuggestion = (prompt: string) => {
    setChatInput(prompt);
  };

  // Render the Dynamic UI Panel matching the API's ui_component string
  const renderComponent = () => {
    if (!dashboardData || !dashboardData.type || !dashboardData.data) return null;

    // Helper to safely convert text block arrays or single multiline string lists to lines
    const getLines = (data: any): string[] => {
      if (typeof data === "string") {
        return data.split("\n").map(l => l.trim()).filter(Boolean);
      }
      if (Array.isArray(data)) {
        return data.map(item => typeof item === "string" ? item : JSON.stringify(item));
      }
      return [];
    };

    switch (dashboardData.type) {
      case "mess_menu": {
        const lines = getLines(dashboardData.data);
        const isArray = Array.isArray(dashboardData.data);
        const breakfast = (!isArray && dashboardData.data?.breakfast) ? dashboardData.data.breakfast : ["Poha Jalebi", "Masala Sprouts", "Banana", "Milk/Tea"];
        const lunch = isArray ? lines : (dashboardData.data?.lunch || lines);
        const dinner = (!isArray && dashboardData.data?.dinner) ? dashboardData.data.dinner : ["Chana Masala", "Aloo Matar Curry", "Palak Puri", "Rice Kheer"];

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Utensils className="h-6 w-6 text-amber-500" /> Daily Bhawan Mess Menu
              </h4>
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-full">Jawahar Bhawan</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Breakfast Column */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                <h5 className="text-base font-bold text-amber-800 uppercase tracking-wider bg-amber-50 px-2.5 py-1 rounded w-max">Breakfast</h5>
                <ul className="space-y-2">
                  {breakfast.map((item: string, i: number) => (
                    <li key={i} className="text-base font-semibold text-slate-700 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lunch Column */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                <h5 className="text-base font-bold text-indigo-800 uppercase tracking-wider bg-indigo-50 px-2.5 py-1 rounded w-max">Lunch</h5>
                <ul className="space-y-2">
                  {lunch.map((item: string, i: number) => (
                    <li key={i} className="text-base font-semibold text-slate-700 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Dinner Column */}
              <div className="space-y-3 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                <h5 className="text-base font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50 px-2.5 py-1 rounded w-max">Dinner</h5>
                <ul className="space-y-2">
                  {dinner.map((item: string, i: number) => (
                    <li key={i} className="text-base font-semibold text-slate-700 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      }

      case "academic_calendar":
      case "calendar_search_results": {
        const lines = getLines(dashboardData.data);
        const titleStr = lines.find((item: string) => item.startsWith("==="))?.replace(/===/g, "").trim() || "Academic Calendar Milestones";
        const events = lines.filter((item: string) => !item.startsWith("===") && !item.startsWith("---"));

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-blue-500" /> {titleStr}
              </h4>
            </div>

            <div className="relative border-l border-slate-100 pl-4 space-y-6">
              {events.map((event: string, idx: number) => {
                const parts = event.split(": ");
                const dateHeader = parts[0] || "";
                const details = parts[1] || "";
                const isHoliday = details.toLowerCase().includes("holiday") || event.toLowerCase().includes("holiday");

                return (
                  <div key={idx} className="relative group">
                    <span className={`absolute -left-[21px] top-2.5 h-3 w-3 rounded-full border-2 border-white ring-4 ring-white ${isHoliday ? "bg-rose-500 ring-rose-50" : "bg-blue-500 ring-blue-50"}`}></span>
                    <div className="space-y-1">
                      <p className={`text-sm font-bold ${isHoliday ? "text-rose-600 bg-rose-50 px-2 py-0.5 rounded w-max" : "text-blue-700 bg-blue-50 px-2 py-0.5 rounded w-max"}`}>
                        {dateHeader}
                      </p>
                      <p className="text-base font-semibold text-slate-700 leading-relaxed">
                        {details || event}
                      </p>
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && (
                <div className="text-base text-slate-600 space-y-2">
                  {lines.map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                  {lines.length === 0 && <p className="text-slate-400">No milestones to display.</p>}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "canteen_menu": {
        const lines = getLines(dashboardData.data);
        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Utensils className="h-6 w-6 text-amber-500" /> Canteen Menu Items (In Budget)
              </h4>
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((item: string, idx: number) => {
                const parts = item.split(" - ");
                return (
                  <div key={idx} className="flex justify-between py-4">
                    <span className="text-base font-medium text-slate-700">{parts[0]}</span>
                    <span className="text-base font-bold text-indigo-600">{parts[1] || ""}</span>
                  </div>
                );
              })}
              {lines.length === 0 && (
                <p className="text-base text-slate-500 py-2">No items found within the specified budget.</p>
              )}
            </div>
          </div>
        );
      }

      case "daily_schedule": {
        const lines = getLines(dashboardData.data);
        const classes = lines.filter((item: string) => item.includes("⏰"));

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-blue-500" /> Daily Schedule & Classes
              </h4>
            </div>
            <div className="space-y-4">
              {classes.length > 0 ? (
                classes.map((item: string, idx: number) => {
                  const clean = item.replace("⏰ ", "");
                  const parts = clean.split(" | ");
                  return (
                    <div key={idx} className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 items-start">
                      <div className="px-3 py-1 rounded bg-blue-100 text-blue-700 text-sm font-bold shrink-0">
                        {parts[0]}
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-slate-800">{parts[1]}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                          <span>{parts[2]}</span>
                          <span>•</span>
                          <span>{parts[3]}</span>
                          <span>•</span>
                          <span>{parts[4]}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-base text-slate-600 space-y-2">
                  {lines.map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                  {lines.length === 0 && <p className="text-slate-400">No classes scheduled.</p>}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "events_list": {
        const lines = getLines(dashboardData.data);
        const eventItems = lines.filter((item: string) => item.includes("🎯"));

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="h-6 w-6 text-rose-500" /> Thomso Festival Search Results
              </h4>
            </div>
            <div className="space-y-3">
              {eventItems.map((item: string, idx: number) => {
                const clean = item.replace(/🎯\s*\[Score:\s*[\d.]+\]\s*/, "");
                const parts = clean.split(" | ");
                return (
                  <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex justify-between items-start">
                    <div>
                      <span className="text-xs uppercase font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
                        {parts[0]}
                      </span>
                      <h5 className="font-bold text-slate-800 text-base mt-2">{parts[1]}</h5>
                      <div className="flex gap-3 text-sm text-slate-400 mt-1">
                        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {parts[2]?.replace("Time: ", "")}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {parts[3]?.replace("Venue: ", "")}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                      {parts[4]?.replace("Category: ", "")}
                    </span>
                  </div>
                );
              })}
              {eventItems.length === 0 && (
                <div className="text-base text-slate-600 space-y-2">
                  {lines.map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                  {lines.length === 0 && <p className="text-slate-400">No events found matching your search.</p>}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "electronic_resources":
      case "tbls_textbooks": {
        const isArray = Array.isArray(dashboardData.data);
        const books = isArray 
          ? dashboardData.data 
          : (dashboardData.data && typeof dashboardData.data === "object" ? [dashboardData.data] : getLines(dashboardData.data));

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-cyan-500" /> Library Resources & Textbooks
              </h4>
            </div>
            <div className="divide-y divide-slate-100">
              {books.map((book: any, idx: number) => {
                if (typeof book === "string") {
                  return (
                    <div key={idx} className="py-4 first:pt-0 last:pb-0">
                      <p className="text-base font-semibold text-slate-700">{book}</p>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-base font-bold text-slate-800">{book.title || book.name}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {book.author && `Author: ${book.author}`}
                      {book.edition && ` | Edition: ${book.edition}`}
                      {book.url && (
                        <a href={book.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline block mt-1 font-semibold">
                          Access Resource
                        </a>
                      )}
                    </p>
                  </div>
                );
              })}
              {books.length === 0 && (
                <p className="text-base text-slate-500 py-2">No textbooks or resources found.</p>
              )}
            </div>
          </div>
        );
      }

      case "library_facility":
        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-cyan-500" /> Library Facility Location
              </h4>
            </div>
            <div className="prose prose-slate text-base text-slate-600 leading-relaxed whitespace-pre-line">
              {typeof dashboardData.data === "string" ? dashboardData.data : JSON.stringify(dashboardData.data)}
            </div>
          </div>
        );

      case "library_guidelines": {
        const isArray = Array.isArray(dashboardData.data);
        const guidelines = isArray 
          ? dashboardData.data 
          : (dashboardData.data && typeof dashboardData.data === "object" ? [dashboardData.data] : []);

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-cyan-500" /> MGCL Library Policy & FAQs
              </h4>
            </div>
            <div className="space-y-4">
              {guidelines.map((g: any, idx: number) => (
                <div key={idx} className="p-5 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="text-xs uppercase font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full">
                    Source: {g.source || "Library Guidelines"}
                  </span>
                  <p className="text-base text-slate-600 mt-3 leading-relaxed font-medium">
                    {g.text}
                  </p>
                </div>
              ))}
              {!isArray && typeof dashboardData.data === "string" && (
                <p className="text-base text-slate-650 leading-relaxed whitespace-pre-line font-medium">
                  {dashboardData.data}
                </p>
              )}
              {guidelines.length === 0 && !dashboardData.data && (
                <p className="text-base text-slate-500 py-2">No library guidelines match the query.</p>
              )}
            </div>
          </div>
        );
      }

      case "library_staff": {
        const isArray = Array.isArray(dashboardData.data);
        const staff = isArray 
          ? dashboardData.data 
          : (dashboardData.data && typeof dashboardData.data === "object" ? [dashboardData.data] : []);

        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-cyan-500" /> Library Staff Contacts
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {staff.map((s: any, idx: number) => (
                <div key={idx} className="p-5 rounded-xl border border-slate-100 bg-slate-50 flex flex-col justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                      <User className="h-5 w-5 text-slate-400" /> {s.name}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">{s.designation}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3.5 text-sm text-indigo-650">
                    {s.emails?.map((email: string, i: number) => (
                      <a key={i} href={`mailto:${email}`} className="flex items-center gap-1 hover:underline font-semibold">
                        <Mail className="h-4 w-4" /> {email}
                      </a>
                    ))}
                    {s.phones?.map((phone: string, i: number) => (
                      <span key={i} className="flex items-center gap-1 text-slate-500">
                        <Phone className="h-4 w-4" /> {phone}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!isArray && (
                <p className="text-base text-slate-600 whitespace-pre-line">{dashboardData.data}</p>
              )}
            </div>
          </div>
        );
      }

      case "textbook_or_staff_details": {
        const textbooks = Array.isArray(dashboardData.data?.textbooks)
          ? dashboardData.data.textbooks
          : (dashboardData.data?.textbooks && typeof dashboardData.data.textbooks === "object" ? [dashboardData.data.textbooks] : []);
        const staff = Array.isArray(dashboardData.data?.staff)
          ? dashboardData.data.staff
          : (dashboardData.data?.staff && typeof dashboardData.data.staff === "object" ? [dashboardData.data.staff] : []);

        return (
          <div className="space-y-6">
            {textbooks.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="h-6 w-6 text-cyan-500" /> Textbook Results
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {textbooks.map((book: any, idx: number) => (
                    <div key={idx} className="py-4 first:pt-0 last:pb-0">
                      <p className="text-base font-bold text-slate-850">{book.title || book.name}</p>
                      <p className="text-sm text-slate-500 mt-1">Author: {book.author} | Edition: {book.edition}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {staff.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h4 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="h-6 w-6 text-cyan-500" /> Staff Directory
                  </h4>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {staff.map((s: any, idx: number) => (
                    <div key={idx} className="p-5 rounded-xl border border-slate-100 bg-slate-50 flex flex-col justify-between">
                      <div>
                        <p className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                          <User className="h-5 w-5 text-slate-450" /> {s.name}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">{s.designation}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3.5 text-sm text-indigo-650">
                        {s.emails?.map((email: string, i: number) => (
                          <a key={i} href={`mailto:${email}`} className="flex items-center gap-1 hover:underline font-semibold">
                            <Mail className="h-4 w-4" /> {email}
                          </a>
                        ))}
                        {s.phones?.map((phone: string, i: number) => (
                          <span key={i} className="flex items-center gap-1 text-slate-500">
                            <Phone className="h-4 w-4" /> {phone}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {textbooks.length === 0 && staff.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h4 className="text-2xl font-bold text-slate-800">Response Data</h4>
                </div>
                <pre className="text-sm text-slate-600 bg-slate-50 p-5 rounded-xl overflow-x-auto">
                  {JSON.stringify(dashboardData.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      }

      default:
        return (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h4 className="text-2xl font-bold text-slate-800">
                Response Data ({dashboardData.type})
              </h4>
            </div>
            <pre className="text-sm text-slate-600 bg-slate-50 p-5 rounded-xl overflow-x-auto">
              {JSON.stringify(dashboardData.data, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans relative">
      {/* LEFT/CENTER: DASHBOARD WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200/80 bg-white flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">IITR Campus Intelligence</h1>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Dashboard Workspace</p>
            </div>
          </div>

          {/* Mobile Chat Toggle Button */}
          <button
            onClick={() => setIsMobileChatOpen(true)}
            className="md:hidden flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-650 hover:text-slate-800 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-xl transition-all duration-200 cursor-pointer"
          >
            <Bot className="h-4 w-4 text-indigo-600" />
            <span>Open Brain</span>
          </button>
        </header>

        {/* Dynamic Canvas Workspace */}
        <main className="flex-1 overflow-y-auto p-8 w-full space-y-6">
          {dashboardData ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Workspace View</span>
                <button
                  onClick={() => {
                    setDashboardData(null);
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

              {/* Active Hub Widgets */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 w-full px-4">
                {/* Academics Card */}
                <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm hover:shadow-md transition-shadow space-y-6 flex flex-col h-full justify-between lg:col-span-3">
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                      <h4 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                        <GraduationCap className="h-6 w-6 text-blue-500" /> Academics Hub
                      </h4>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-wider">
                        {(() => {
                          const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                          return weekdayNames[new Date().getDay()];
                        })()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Timetable schedule (Left column) */}
                      <div className="space-y-4">
                        <h5 className="text-base font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="h-5 w-5 text-slate-400" /> Today's Schedule
                        </h5>
                        <div className="space-y-4 pr-1">
                          {initData?.academics?.timetable && initData.academics.timetable.length > 0 ? (
                            initData.academics.timetable.map((cls: any, i: number) => (
                              <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-2 hover:border-blue-200 transition-colors">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                    {cls.course_code}
                                  </span>
                                  <span className="text-xs font-medium text-slate-400">
                                    {cls.time}
                                  </span>
                                </div>
                                <p className="text-base font-bold text-slate-800 line-clamp-1">{cls.course_name || "Course Session"}</p>
                                <div className="flex justify-between items-center text-xs text-slate-500">
                                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4 shrink-0" /> {cls.room_no}</span>
                                  <span className="font-medium">{cls.professor?.split(',')[0]}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                              No classes scheduled today. ☕
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Calendar deadlines (Right column) */}
                      <div className="space-y-4">
                        <h5 className="text-base font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="h-5 w-5 text-slate-400" /> Deadlines & Events
                        </h5>
                        <div className="space-y-4 pr-1">
                          {(() => {
                            const cal = initData?.academics?.calendar;
                            const hasHolidays = cal?.official_holidays && cal.official_holidays.length > 0;
                            const hasRescheduling = cal?.time_table_rescheduling && cal.time_table_rescheduling.length > 0;
                            const hasSchedule = cal?.chronological_schedule && cal.chronological_schedule.length > 0;

                            if (hasHolidays || hasRescheduling || hasSchedule) {
                              return (
                                <>
                                  {cal.official_holidays?.map((h: any, i: number) => (
                                    <div key={`h-${i}`} className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3">
                                      <span className="p-1.5 bg-rose-100 text-rose-600 rounded shrink-0">
                                        <Sparkles className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <p className="text-sm font-bold text-rose-800">🎉 Holiday: {h.name}</p>
                                        <p className="text-xs text-rose-600 font-medium mt-0.5">{h.date} ({h.day})</p>
                                      </div>
                                    </div>
                                  ))}
                                  {cal.time_table_rescheduling?.map((r: any, i: number) => (
                                    <div key={`r-${i}`} className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                                      <span className="p-1.5 bg-amber-100 text-amber-700 rounded shrink-0">
                                        <AlertCircle className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <p className="text-sm font-bold text-amber-800">⚠️ Rescheduled Day</p>
                                        <p className="text-xs text-amber-700 font-medium mt-0.5">Today follows timetable of {r.follows_timetable_of}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {cal.chronological_schedule?.map((s: any, i: number) => (
                                    <div key={`s-${i}`} className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-start gap-3">
                                      <span className="p-1.5 bg-blue-100 text-blue-600 rounded shrink-0">
                                        <Calendar className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <p className="text-sm font-bold text-blue-800">{s.details}</p>
                                        <p className="text-xs text-blue-600 font-medium mt-0.5">
                                          {s.start_date === s.end_date ? s.start_date : `${s.start_date} to ${s.end_date}`}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </>
                              );
                            } else {
                              return (
                                <div className="p-6 md:p-8 rounded-xl bg-emerald-50/50 border border-emerald-100 flex flex-col items-center justify-center text-center gap-3">
                                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                  <div>
                                    <p className="text-sm font-bold text-emerald-800">All Clear Today</p>
                                    <p className="text-xs text-emerald-600 font-medium mt-0.5">No holidays, rescheduled sessions, or calendar deadlines scheduled for today.</p>
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mess Card */}
                <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full justify-between lg:col-span-2">
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                      <h4 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                        <Utensils className="h-6 w-6 text-amber-500" /> Daily Mess Menu
                      </h4>
                      <span className="text-sm font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                        Jawahar Bhawan
                      </span>
                    </div>

                    {/* Meal Selector Tabs */}
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
                      {["breakfast", "lunch", "dinner"].map((meal) => (
                        <button
                          key={meal}
                          onClick={() => setActiveMealView(meal)}
                          className={`flex-1 py-2 px-3 text-sm font-bold rounded-lg capitalize transition-all cursor-pointer ${activeMealView === meal
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-400 hover:text-slate-600"
                            }`}
                        >
                          {meal}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      {/* Breakfast Magnified */}
                      {activeMealView === "breakfast" && (() => {
                        const menu = initData?.ui_data?.data?.breakfast || ["Masala Oats", "Banana", "Boiled Egg", "Milk/Tea"];
                        const isSystemActive = initData?.ui_data?.data?.active_meal === "breakfast";
                        return (
                          <div className="p-8 md:p-10 rounded-2xl border transition-all duration-300 scale-100 bg-amber-50/60 border-amber-300 ring-2 ring-amber-300/20 shadow-md">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="text-base font-extrabold text-amber-800 uppercase tracking-wider bg-amber-100/60 px-3 py-1 rounded">
                                Breakfast
                              </h5>
                              {isSystemActive && (
                                <span className="flex items-center gap-1 text-xs font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Current Meal
                                </span>
                              )}
                            </div>
                            <p className="text-sm md:text-md font-bold text-slate-850 leading-relaxed">
                              {Array.isArray(menu) ? menu.join(", ") : menu}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Lunch Magnified */}
                      {activeMealView === "lunch" && (() => {
                        const menu = initData?.ui_data?.data?.lunch || ["Kadhai Paneer", "Dal Makhani", "Jeera Rice", "Roti", "Raita", "Salad"];
                        const isSystemActive = initData?.ui_data?.data?.active_meal === "lunch";
                        return (
                          <div className="p-8 md:p-10 rounded-2xl border transition-all duration-300 scale-100 bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-300/20 shadow-md">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="text-base font-extrabold text-indigo-800 uppercase tracking-wider bg-indigo-100/60 px-3 py-1 rounded">
                                Lunch
                              </h5>
                              {isSystemActive && (
                                <span className="flex items-center gap-1 text-xs font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Current Meal
                                </span>
                              )}
                            </div>
                            <p className="text-sm md:text-md font-bold text-slate-850 leading-relaxed">
                              {Array.isArray(menu) ? menu.join(", ") : menu}
                            </p>
                          </div>
                        );
                      })()}

                      {/* Dinner Magnified */}
                      {activeMealView === "dinner" && (() => {
                        const menu = initData?.ui_data?.data?.dinner || ["Chana Masala", "Aloo Matar", "Palak Puri", "Rice", "Rice Kheer"];
                        const isSystemActive = initData?.ui_data?.data?.active_meal === "dinner";
                        return (
                          <div className="p-8 md:p-10 rounded-2xl border transition-all duration-300 scale-100 bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-300/20 shadow-md">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="text-base font-extrabold text-emerald-800 uppercase tracking-wider bg-emerald-100/60 px-3 py-1 rounded">
                                Dinner
                              </h5>
                              {isSystemActive && (
                                <span className="flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Current Meal
                                </span>
                              )}
                            </div>
                            <p className="text-sm md:text-md font-bold text-slate-850 leading-relaxed">
                              {Array.isArray(menu) ? menu.join(", ") : menu}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Minimal Suggestion Prompts */}
              {/* <div className="space-y-3 max-w-xl mx-auto">
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
              </div> */}
            </div>
          )}
        </main>
      </div>

      {/* Backdrop for mobile drawer */}
      {isMobileChatOpen && (
        <div
          onClick={() => setIsMobileChatOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* RIGHT: AI ASSISTANT PANEL */}
      <aside className={`
        fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-slate-200 bg-white flex flex-col h-full shadow-2xl transition-transform duration-300 transform
        ${isMobileChatOpen ? "translate-x-0" : "translate-x-full"}
        md:relative md:translate-x-0 md:w-96 md:h-full md:shadow-lg md:shadow-slate-100/30 md:z-auto md:flex shrink-0
      `}>
        {/* Header: A simple container displaying an avatar icon and title */}
        <div className="h-16 border-b border-slate-200/80 flex items-center justify-between px-4 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-slate-600 text-white rounded-lg">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-md font-bold text-slate-900 flex items-center gap-1">
                Campus Intelligence Brain
              </h2>
              <p className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
                {isLoading ? "Thinking..." : "Ready"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <Sparkles className="h-4 w-4 text-indigo-600" />
            </span>
            <button
              onClick={() => setIsMobileChatOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Message Timeline: A scrollable middle pane */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/15">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
            >
              <div
                className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === "user"
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
                ) : msg.sender === "ai" ? (
                  <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed">
                    <ReactMarkdown>
                      {msg.text}
                    </ReactMarkdown>
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



