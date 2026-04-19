import React, { useState, useEffect, useRef } from 'react';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot, limit, orderBy, Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Timer, 
  Flame, 
  Users, 
  Mail, 
  Github, 
  Search, 
  Plus, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  Play, 
  Square, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Brain
} from 'lucide-react';
import { cn } from './lib/utils';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import * as d3 from 'd3';

// Types
interface Profile {
  uid: string;
  email: string;
  leetcodeUsername: string;
  totalSolved: number;
  rank: number;
  friends: string[];
  goal: number;
  avatar?: string;
  realName?: string;
}

interface Activity {
  id: string;
  uid: string;
  date: string;
  solvedCount: number;
  timeSpent: number;
}

// Components
const StreakGrid = ({ activities }: { activities: Activity[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous
    d3.select(containerRef.current).selectAll('*').remove();

    const width = 600;
    const height = 100;
    const cellSize = 10;
    const gap = 3;

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'w-full h-auto');

    const now = new Date();
    const startDate = subDays(now, 120);
    const dayInterval = eachDayOfInterval({ start: startDate, end: now });

    const colorScale = d3.scaleThreshold<number, string>()
      .domain([1, 2, 4, 6])
      .range(['#2c2c2c', '#0e4429', '#006d32', '#26a641', '#39d353']);

    svg.selectAll('rect')
      .data(dayInterval)
      .enter()
      .append('rect')
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('x', (d, i) => Math.floor(i / 7) * (cellSize + gap))
      .attr('y', (d, i) => (i % 7) * (cellSize + gap))
      .attr('rx', 2)
      .attr('fill', d => {
        const act = activities.find(a => isSameDay(new Date(a.date), d));
        return colorScale(act?.solvedCount || 0);
      })
      .append('title')
      .text(d => `${format(d, 'MMM d, yyyy')}: ${activities.find(a => isSameDay(new Date(a.date), d))?.solvedCount || 0} solved`);
  }, [activities]);

  return <div ref={containerRef} className="p-4 bg-[#1a1a1a] rounded-xl border border-zinc-800/50 backdrop-blur-sm overflow-x-auto" />;
};

const FocusTimer = ({ onComplete }: { onComplete: (seconds: number) => void }) => {
  const [isActive, setIsActive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  
  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const handleStop = () => {
    setIsActive(false);
    onComplete(seconds);
    setSeconds(0);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <motion.div 
        layout
        className="bg-[#1a1a1a] border border-zinc-800 rounded-full p-2 flex items-center shadow-2xl shadow-emerald-500/10"
      >
        <div className="px-4 font-mono text-xl text-emerald-500 min-w-[80px]">
          {formatTime(seconds)}
        </div>
        <button 
          onClick={() => setIsActive(!isActive)}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
            isActive ? "bg-zinc-800 text-zinc-400" : "bg-emerald-600 text-white hover:bg-emerald-500"
          )}
        >
          {isActive ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        {seconds > 0 && !isActive && (
          <button 
            onClick={handleStop}
            className="ml-2 px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full text-xs font-medium hover:bg-zinc-700"
          >
            Save Session
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [showFriendModal, setShowFriendModal] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [myUsernameInput, setMyUsernameInput] = useState('');
  const [friendStats, setFriendStats] = useState<Record<string, number>>({});
  const [dailyChallenge, setDailyChallenge] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch or create profile
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const newProfile: Profile = {
            uid: u.uid,
            email: u.email || '',
            leetcodeUsername: '',
            totalSolved: 0,
            rank: 999999,
            friends: [],
            goal: 1
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
          setShowUsernameModal(true);
        } else {
          const data = userSnap.data() as Profile;
          setProfile(data);
          if (!data.leetcodeUsername) {
            setShowUsernameModal(true);
          }
        }

        // Fetch activities
        const q = query(
          collection(db, 'activities'), 
          where('uid', '==', u.uid),
          orderBy('date', 'desc'),
          limit(100)
        );
        onSnapshot(q, (snapshot) => {
          setActivities(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Activity));
        });
      } else {
        // Handle guest mode from local storage
        const savedUsername = localStorage.getItem('leetcode_guest_username');
        if (savedUsername) {
          setIsGuest(true);
          setProfile({
            uid: 'guest',
            email: '',
            leetcodeUsername: savedUsername,
            totalSolved: 0,
            rank: 1000000,
            friends: [],
            goal: 1
          });
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch friend profiles
  useEffect(() => {
    if (profile?.friends?.length) {
      const q = query(collection(db, 'users'), where('uid', 'in', profile.friends));
      const unsub = onSnapshot(q, (snapshot) => {
        setFriends(snapshot.docs.map(d => d.data() as Profile));
      });
      return () => unsub();
    } else {
      setFriends([]);
    }
  }, [profile?.friends]);

  // Fetch friend's solves for today
  useEffect(() => {
    if (friends.length > 0) {
      const today = format(new Date(), 'yyyy-MM-dd');
      const q = query(
        collection(db, 'activities'), 
        where('uid', 'in', friends.map(f => f.uid)),
        where('date', '==', today)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const stats: Record<string, number> = {};
        snapshot.docs.forEach(d => {
          const act = d.data() as Activity;
          stats[act.uid] = act.solvedCount;
        });
        setFriendStats(stats);
      });
      return () => unsub();
    }
  }, [friends]);

  useEffect(() => {
    const fetchDaily = async () => {
      try {
        const resp = await fetch('/api/leetcode/daily');
        const data = await resp.json();
        setDailyChallenge(data);
      } catch (err) {
        console.error("Fetch daily error:", err);
      }
    };
    fetchDaily();
  }, []);

  // Sync LeetCode data for the user
  useEffect(() => {
    if (profile?.leetcodeUsername) {
      const syncLeetCode = async () => {
        try {
          const resp = await fetch(`/api/leetcode/user/${profile.leetcodeUsername}`);
          const data = await resp.json();
          if (data && data.profile) {
            const updatedProfile = {
              ...profile,
              rank: data.profile.ranking,
              avatar: data.profile.userAvatar,
              realName: data.profile.realName,
              totalSolved: data.submitStats.acSubmissionNum.find((s: any) => s.difficulty === 'All')?.count || profile.totalSolved
            };

            // Only update if changed significantly
            if (updatedProfile.rank !== profile.rank || updatedProfile.totalSolved !== profile.totalSolved || updatedProfile.avatar !== profile.avatar) {
              await setDoc(doc(db, 'users', profile.uid), updatedProfile);
              setProfile(updatedProfile);
            }
          }
        } catch (err) {
          console.error("LeetCode sync error:", err);
        }
      };
      // Initial sync and then every 30 minutes
      syncLeetCode();
      const interval = setInterval(syncLeetCode, 30 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [profile?.leetcodeUsername]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };

  const sendReminder = async () => {
    if (!user?.email) return;
    try {
      const resp = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          subject: 'LeetTracker Pro: Remember to solve today!',
          message: `Hey ${user.displayName || 'Coder'}, don't forget to solve today's LeetCode challenge: ${dailyChallenge?.question?.title || 'Daily Task'}. Keep your momentum going!`
        })
      });
      const data = await resp.json();
      if (data.success) {
        alert("Reminder sent to your email!");
      } else {
        alert("Enter credentials in .env to enable email service.");
      }
    } catch (err) {
      console.error(err);
      alert("Email service not available.");
    }
  };

  const updateMyUsername = async () => {
    if (!myUsernameInput) return;
    try {
      if (isGuest || !user) {
        localStorage.setItem('leetcode_guest_username', myUsernameInput);
        setIsGuest(true);
        setProfile({
          uid: 'guest',
          email: '',
          leetcodeUsername: myUsernameInput,
          totalSolved: 0,
          rank: 0,
          friends: [],
          goal: 1
        });
        setShowUsernameModal(false);
        return;
      }

      // Check if username is taken
      const q = query(collection(db, 'users'), where('leetcodeUsername', '==', myUsernameInput));
      const snap = await getDocs(q);
      if (!snap.empty && snap.docs[0].id !== profile.uid) {
        alert("This username is already taken!");
        return;
      }

      const updated = { ...profile, leetcodeUsername: myUsernameInput };
      await setDoc(doc(db, 'users', profile.uid), updated);
      setProfile(updated);
      setShowUsernameModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const addFriend = async () => {
    if (!profile || !friendUsername) return;
    try {
      const q = query(collection(db, 'users'), where('leetcodeUsername', '==', friendUsername));
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("User with this LeetCode username not found!");
        return;
      }
      const friendData = snap.docs[0].data() as Profile;
      if (friendData.uid === profile.uid) {
        alert("You cannot add yourself!");
        return;
      }
      if (profile.friends.includes(friendData.uid)) {
        alert("Already friends!");
        return;
      }
      if (profile.friends.length >= 5) {
        alert("Maximum 5 friends allowed.");
        return;
      }

      await setDoc(doc(db, 'users', profile.uid), {
        ...profile,
        friends: [...profile.friends, friendData.uid]
      });
      setFriendUsername('');
      setShowFriendModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const removeFriend = async (friendUid: string) => {
    if (!profile) return;
    try {
      const updatedFriends = profile.friends.filter(id => id !== friendUid);
      await setDoc(doc(db, 'users', profile.uid), {
        ...profile,
        friends: updatedFriends
      });
      setProfile({ ...profile, friends: updatedFriends });
    } catch (err) {
      console.error(err);
    }
  };

  const recordSolve = async (timeSpent: number = 0) => {
    if (!profile) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    
    if (isGuest || profile.uid === 'guest') {
      const guestActivity: Activity = {
        id: `guest_${today}`,
        uid: 'guest',
        date: today,
        solvedCount: 1,
        timeSpent: timeSpent
      };
      
      const existing = activities.find(a => a.date === today);
      if (existing) {
        setActivities(activities.map(a => a.date === today ? { ...a, solvedCount: a.solvedCount + 1, timeSpent: a.timeSpent + timeSpent } : a));
      } else {
        setActivities([guestActivity, ...activities]);
      }
      
      setProfile({
        ...profile,
        totalSolved: (profile.totalSolved || 0) + 1
      });
      return;
    }

    const activityId = `${profile.uid}_${today}`;
    const activityRef = doc(db, 'activities', activityId);
    const snap = await getDoc(activityRef);

    if (snap.exists()) {
      const data = snap.data() as Activity;
      await setDoc(activityRef, {
        ...data,
        solvedCount: data.solvedCount + 1,
        timeSpent: data.timeSpent + timeSpent
      });
    } else {
      await setDoc(activityRef, {
        uid: profile.uid,
        date: today,
        solvedCount: 1,
        timeSpent: timeSpent
      });
    }

    // Update total profile solve count
    await setDoc(doc(db, 'users', profile.uid), {
      ...profile,
      totalSolved: (profile.totalSolved || 0) + 1
    });
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#39d353] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user && !isGuest) return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_50%_0%,#10b98110_0%,transparent_50%)]">
      <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl flex items-center justify-center rotate-3 mb-8 shadow-2xl shadow-emerald-500/20">
        <Trophy size={48} className="text-white" />
      </div>
      <h1 className="text-5xl font-bold mb-4 tracking-tighter text-center">LeetTracker <span className="text-emerald-500">Stack</span></h1>
      <p className="text-zinc-500 text-lg mb-12 text-center max-w-sm">Elevate your coding session. Real-time tracking for elite developers.</p>
      
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button 
          onClick={() => setShowUsernameModal(true)}
          className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/20"
        >
          Get Started (Guest)
        </button>
        <button 
          onClick={handleLogin}
          className="group relative w-full py-4 bg-zinc-900 border border-zinc-800 text-white font-bold rounded-xl overflow-hidden transition-all hover:border-emerald-500/50"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            <Github size={20} />
            Connect via Google
          </span>
        </button>
      </div>
    </div>
  );

  const todaySolved = activities.find(a => a.date === format(new Date(), 'yyyy-MM-dd'))?.solvedCount || 0;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#eff2f6] font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Sidebar */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 border-r border-zinc-800/50 flex flex-col items-center py-8 gap-10 bg-[#1a1a1a] z-50">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-500/20">
          LS
        </div>
        <div className="flex flex-col gap-6">
          <button className="p-3 bg-zinc-800/50 rounded-xl text-emerald-500"><TrendingUp size={20} /></button>
          <button className="p-3 text-zinc-500 hover:text-white transition-colors"><Users size={20} /></button>
          <button className="p-3 text-zinc-500 hover:text-white transition-colors"><Mail size={20} /></button>
        </div>
        <div className="mt-auto flex flex-col gap-6">
          <button className="p-3 text-zinc-500 hover:text-white transition-colors"><Settings size={20} /></button>
          <button 
            onClick={() => {
              auth.signOut();
              localStorage.removeItem('leetcode_guest_username');
              setIsGuest(false);
              setProfile(null);
            }}
            className="p-3 text-zinc-500 hover:text-red-500 transition-colors"
          ><LogOut size={20} /></button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 max-w-7xl mx-auto p-10">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
               {profile?.avatar ? (
                 <img src={profile.avatar} alt="Me" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
               ) : (
                 <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 font-bold text-xl">
                   {profile?.leetcodeUsername?.[0]?.toUpperCase()}
                 </div>
               )}
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">{profile?.realName || profile?.leetcodeUsername || 'Coder'}</h2>
              <p className="text-zinc-500 flex items-center gap-2 mt-1">
                <span className="text-emerald-500 font-mono">Rank {profile?.rank?.toLocaleString() || '---'}</span>
                <span>•</span>
                <span>{profile?.leetcodeUsername}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isGuest ? (
              <span className="px-3 py-1 text-[10px] font-bold border border-orange-500/30 text-orange-500 rounded-lg tracking-wider bg-orange-500/5">GUEST</span>
            ) : (
              <span className="px-3 py-1 text-[10px] font-bold border border-emerald-500/30 text-emerald-500 rounded-lg tracking-wider bg-emerald-500/5 uppercase">Synced Account</span>
            )}
            <button 
              onClick={() => recordSolve()}
              className="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2 active:scale-95"
            >
              <Plus size={18} />
              Log Mastery
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* Stats Section */}
          <section className="col-span-12 grid grid-cols-4 gap-6">
            <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 hover:border-emerald-500/30 transition-all group shadow-xl">
              <div className="flex items-center gap-3 text-zinc-500 mb-4 font-bold uppercase text-[10px] tracking-[2px]">
                <Flame size={14} className="text-emerald-500" /> Active Days
              </div>
              <div className="text-3xl font-bold text-zinc-100">{activities.length} <span className="text-sm font-normal text-zinc-600">Days</span></div>
            </div>
            <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 hover:border-emerald-500/30 transition-all group shadow-xl">
              <div className="flex items-center gap-3 text-zinc-500 mb-4 font-bold uppercase text-[10px] tracking-[2px]">
                <Trophy size={14} className="text-emerald-500" /> Contest Rating
              </div>
              <div className="text-3xl font-bold text-zinc-100">1,415 <span className="text-sm font-normal text-zinc-600">Pts</span></div>
            </div>
            <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 hover:border-emerald-500/30 transition-all group shadow-xl">
              <div className="flex items-center gap-3 text-zinc-500 mb-4 font-bold uppercase text-[10px] tracking-[2px]">
                <CheckCircle2 size={14} className="text-emerald-500" /> Total Solved
              </div>
              <div className="text-3xl font-bold text-zinc-100">{profile?.totalSolved || 0}</div>
            </div>
            <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 hover:border-emerald-500/30 transition-all group shadow-xl">
              <div className="flex items-center gap-3 text-zinc-500 mb-4 font-bold uppercase text-[10px] tracking-[2px]">
                <Timer size={14} className="text-emerald-500" /> Quest Goal
              </div>
              <div className="text-3xl font-bold text-zinc-100">{todaySolved}/{profile?.goal || 1}</div>
            </div>
          </section>

          {/* Activity Map */}
          <section className="col-span-12 lg:col-span-8 space-y-8">
            <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] uppercase tracking-[3px] text-zinc-500 font-bold">Submission Heatmap</h3>
              </div>
              <StreakGrid activities={activities} />
            </div>

            {/* Problem of the Day */}
            <div className="space-y-4">
              <h3 className="text-[11px] uppercase tracking-[3px] text-zinc-500 font-bold">Today's Protocol</h3>
              <div className="questions-list space-y-4">
                <div className="p-6 bg-[#1a1a1a] rounded-2xl border border-zinc-800 flex justify-between items-center group cursor-pointer hover:border-emerald-500/30 transition-all shadow-xl">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-800 group-hover:border-emerald-500/50 transition-colors">
                      <Brain size={24} className="text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1 font-bold uppercase">Daily Objective</div>
                      <h4 className="text-lg font-bold text-zinc-100 group-hover:text-emerald-500 transition-colors">{dailyChallenge?.question?.title || "Retrieving Protocol..."}</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "text-[10px] py-1 px-3 border rounded-lg font-bold uppercase tracking-wider",
                      dailyChallenge?.question?.difficulty === 'Easy' ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5" :
                      dailyChallenge?.question?.difficulty === 'Medium' ? "border-orange-500/20 text-orange-500 bg-orange-500/5" :
                      "border-red-500/20 text-red-500 bg-red-500/5"
                    )}>
                      {dailyChallenge?.question?.difficulty || 'N/A'}
                    </span>
                    <button onClick={sendReminder} className="text-zinc-500 hover:text-emerald-500 transition-colors"><Mail size={16} /></button>
                    <a href={dailyChallenge ? `https://leetcode.com${dailyChallenge.link}` : "https://leetcode.com/problemset/all/"} target="_blank" rel="noreferrer" className="text-emerald-500 hover:scale-110 transition-transform"><ExternalLink size={16} /></a>
                  </div>
                </div>

                <div className="p-6 bg-[#1A1A1A] rounded-xl border border-[#222222] flex justify-between items-center group opacity-80 hover:opacity-100 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-[#121212] rounded-xl flex items-center justify-center border border-[#222222]">
                      <Github size={24} className="text-zinc-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#888888] mb-1">#42</div>
                      <h4 className="text-lg font-bold">Trapping Rain Water</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] py-1 px-3 border border-red-500/50 text-red-500 rounded-full font-bold uppercase tracking-wider">Hard</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Friends Sidebar */}
          <section className="col-span-12 lg:col-span-4 space-y-8">
            <div className="p-6 bg-[#0d0d0d] rounded-2xl border border-zinc-800/50 min-h-[400px] shadow-2xl relative overflow-hidden">
              {/* LeetCode Header Style */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-orange-500 to-red-500 opacity-30" />
              
              <div className="flex justify-between items-center mb-8 relative z-10">
                <h3 className="text-[11px] uppercase tracking-[3px] text-zinc-500 font-bold">Rival Comparison</h3>
                <button 
                  onClick={() => setShowFriendModal(true)}
                  disabled={isGuest}
                  className="p-1.5 hover:bg-emerald-500/10 rounded-lg transition-all text-emerald-400 disabled:opacity-20 hover:scale-110 active:scale-95"
                >
                  <Plus size={20} />
                </button>
              </div>
              
              <div className="space-y-3 relative z-10">
                <AnimatePresence mode="popLayout">
                  {isGuest ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-12 text-center"
                    >
                      <LogOut className="mx-auto w-12 h-12 text-zinc-800 mb-4" />
                      <p className="text-zinc-500 text-xs leading-relaxed">Comparison requires login.<br/><span className="text-emerald-500 font-medium">Challenge world's best coders.</span></p>
                    </motion.div>
                  ) : (
                    [profile, ...friends]
                      .filter((p): p is Profile => !!p)
                      .sort((a, b) => b.totalSolved - a.totalSolved)
                      .map((p, index) => (
                        <motion.div 
                          key={p.uid}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className={cn(
                            "relative p-4 rounded-xl border transition-all group overflow-hidden",
                            p.uid === profile?.uid 
                              ? "bg-zinc-900/40 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
                              : "bg-[#1a1a1a] border-zinc-800 hover:border-zinc-700"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-700 group-hover:border-emerald-500/50 transition-colors">
                                {p.avatar ? (
                                  <img src={p.avatar} alt={p.leetcodeUsername} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-500">
                                    {p.leetcodeUsername?.[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className={cn(
                                "absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold border",
                                index === 0 ? "bg-yellow-500 text-black border-yellow-300" :
                                index === 1 ? "bg-zinc-300 text-black border-zinc-100" :
                                index === 2 ? "bg-orange-600 text-white border-orange-400" :
                                "bg-zinc-800 text-zinc-400 border-zinc-700"
                              )}>
                                {index + 1}
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="font-bold text-sm truncate text-zinc-100">{p.leetcodeUsername}</span>
                                {p.uid === profile?.uid && (
                                  <span className="text-[10px] font-bold text-emerald-500 uppercase px-1.5 py-0.5 bg-emerald-500/10 rounded">Me</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (p.totalSolved / (profile?.goal || 100)) * 100)}%` }}
                                    className="h-full bg-emerald-500"
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-zinc-500">{p.totalSolved} solved</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              {p.uid !== profile?.uid && !isGuest && (
                                <button 
                                  onClick={() => removeFriend(p.uid)}
                                  className="p-1 text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-500/10"
                                >
                                  <Plus size={14} className="rotate-45" />
                                </button>
                              )}
                              <div className="text-[10px] text-zinc-500 font-mono">#{p.rank?.toLocaleString()}</div>
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                friendStats[p.uid] > 0 || (p.uid === profile?.uid && todaySolved > 0)
                                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"
                                  : "bg-zinc-800"
                              )} />
                            </div>
                          </div>
                        </motion.div>
                      ))
                  )}
                </AnimatePresence>
              </div>
              
              {!isGuest && (
                <div className="mt-8 pt-4 border-t border-zinc-800/50 flex justify-center">
                  <button 
                    onClick={() => setShowFriendModal(true)}
                    className="text-[11px] font-bold text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-2 uppercase tracking-widest"
                  >
                    <Plus size={14} /> Add Friend ({friends.length}/5)
                  </button>
                </div>
              )}
            </div>

            {/* Session Widget */}
            <div className="p-6 bg-[#0d0d0d] rounded-2xl border border-zinc-800/50 text-center relative group overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20" />
               <div className="text-[11px] uppercase tracking-[3px] text-zinc-500 font-bold mb-6">Active Session</div>
               <div className="text-5xl font-mono text-zinc-100 mb-2 tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                 00:00:00
               </div>
               <p className="text-[11px] text-zinc-500 mb-8 tracking-wide uppercase font-medium">Deep focus mode • #238</p>
               <button className="w-full py-4 bg-zinc-100 text-black font-bold rounded-xl text-xs uppercase tracking-[2px] hover:bg-white transition-all shadow-xl active:scale-95">
                 Start Session
               </button>
            </div>
          </section>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showFriendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#121212] border border-[#222222] p-8 rounded-3xl shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-2">Add a Rival</h3>
              <p className="text-[#888888] text-sm mb-6">Enter their LeetCode username to start the challenge.</p>
              <div className="mb-6">
                <label className="block text-xs font-bold text-[#888888] uppercase tracking-widest mb-2">LeetCode Username</label>
                <input 
                  type="text" 
                  value={friendUsername}
                  onChange={(e) => setFriendUsername(e.target.value)}
                  className="w-full bg-[#050505] border border-[#222222] rounded-xl px-4 py-3 outline-none focus:border-[#39d353]/50 transition-colors text-white"
                  placeholder="LeetCoder123"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowFriendModal(false)}
                  className="flex-1 py-3 bg-[#1A1A1A] rounded-xl text-[#888888] font-semibold hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={addFriend}
                  disabled={isGuest}
                  className="flex-1 py-3 bg-[#39d353] text-black rounded-xl font-bold hover:bg-green-400 transition-colors disabled:opacity-50"
                >
                  Add Friend
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Username Setup Modal */}
        {showUsernameModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md bg-[#121212] border border-[#39d353]/20 p-8 rounded-3xl shadow-[0_0_50px_rgba(57,211,83,0.1)]"
            >
              <div className="w-16 h-16 bg-[#39d353]/10 rounded-2xl flex items-center justify-center mb-6 border border-[#39d353]/30">
                <Github size={32} className="text-[#39d353]" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Claim Your Handle</h3>
              <p className="text-[#888888] text-sm mb-6">Enter your LeetCode username. We'll pull your real data instantly.</p>
              <div className="mb-6">
                <label className="block text-xs font-bold text-[#888888] uppercase tracking-widest mb-2">Your LeetCode Username</label>
                <input 
                  type="text" 
                  value={myUsernameInput}
                  onChange={(e) => setMyUsernameInput(e.target.value)}
                  className="w-full bg-[#050505] border border-[#222222] rounded-xl px-4 py-3 outline-none focus:border-[#39d353]/50 transition-colors text-white font-mono"
                  placeholder="LeetCoder_99"
                  autoFocus
                />
              </div>
              <button 
                onClick={updateMyUsername}
                disabled={!myUsernameInput}
                className="w-full py-4 bg-[#39d353] text-black rounded-xl font-bold hover:bg-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Go to Dashboard
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FocusTimer onComplete={(s) => recordSolve(s)} />
    </div>
  );
}
