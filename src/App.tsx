/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Home, 
  BookOpen, 
  ShieldCheck, 
  ShoppingBag, 
  MessageCircleQuestion, 
  Users, 
  LifeBuoy, 
  Settings,
  Diamond,
  Coins,
  LogOut,
  User as UserIcon,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Plus,
  Send,
  Trash2,
  Edit,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db } from './lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc,
  where,
  orderBy,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';

// Types
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Not throwing to avoid crashing the whole app, but logging is critical
}

type Page = 'home' | 'whitelist' | 'rules' | 'store' | 'faq' | 'orgs' | 'support' | 'admin';

type UserRole = 'player' | 'admin' | 'diretor' | 'administrador' | 'coordenador' | 'moderador' | 'suporte';

interface UserData {
  displayName: string;
  role: UserRole;
  coins: number;
  diamonds: number;
  avatarUrl: string;
  accountId: number;
  lastActive?: any;
}

interface SettingsData {
  backgroundUrl: string;
  logoUrl: string;
  fivemCfxId?: string;
  serverIp?: string;
}

// Components
function Logo({ className, size = 'md', align = 'center', url }: { className?: string; size?: 'sm' | 'md' | 'lg'; align?: 'center' | 'left', url?: string }) {
  const sizes = {
    sm: 'h-10 sm:h-12',
    md: 'h-20 sm:h-28',
    lg: 'h-48 sm:h-72'
  };
  
  return (
    <div className={cn("flex flex-col leading-none select-none", align === 'center' ? "items-center" : "items-start", className)}>
      <img 
        src={url || "/logo.png"} 
        alt="Verdinha City" 
        className={cn("object-contain filter drop-shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:drop-shadow-[0_0_25px_rgba(34,197,94,0.5)] transition-all duration-500", sizes[size])}
      />
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [settings, setSettings] = useState<SettingsData>({ 
    backgroundUrl: 'https://images.unsplash.com/photo-1544006659-f0b21f04cb1d?q=80&w=2670&auto=format&fit=crop', 
    logoUrl: 'https://i.imgur.com/8QzLzYn.png',
    fivemCfxId: '',
    serverIp: ''
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  useEffect(() => {
    // Online Users Listener
    const q = query(collection(db, 'users'));
    const unsubOnline = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      const online = users.filter((u: any) => {
        if (!u.lastActive) return false;
        const lastActiveTime = u.lastActive.toDate ? u.lastActive.toDate().getTime() : new Date(u.lastActive).getTime();
        return (now - lastActiveTime) < oneHour;
      });
      setOnlineUsers(online);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Load Settings
    const settingsRef = doc(db, 'settings', 'global');
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as SettingsData;
        setSettings({
          backgroundUrl: data.backgroundUrl || 'https://images.unsplash.com/photo-1544006659-f0b21f04cb1d?q=80&w=2670&auto=format&fit=crop',
          logoUrl: data.logoUrl || 'https://i.imgur.com/8QzLzYn.png',
          fivemCfxId: data.fivemCfxId || '',
          serverIp: data.serverIp || ''
        });
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global'));

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create user data
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const existingData = userSnap.data() as UserData;
            if (existingData.accountId === undefined || existingData.accountId === null) {
              // Assign ID to existing user without ID
              let newAccountId = 0;
              if (firebaseUser.email === 'tatobeats@outlook.com') {
                newAccountId = 1;
              } else {
                try {
                  const counterRef = doc(db, 'settings', 'counters');
                  await runTransaction(db, async (transaction) => {
                    const counterSnap = await transaction.get(counterRef);
                    let nextId = 100;
                    if (counterSnap.exists()) {
                      nextId = (counterSnap.data().lastAccountId || 99) + 1;
                    }
                    transaction.set(counterRef, { lastAccountId: nextId }, { merge: true });
                    newAccountId = nextId;
                  });
                } catch (err) {
                  newAccountId = Math.floor(100 + Math.random() * 900);
                }
              }
              const updatedData = { ...existingData, accountId: newAccountId, lastActive: serverTimestamp() };
              await updateDoc(userRef, { accountId: newAccountId, lastActive: serverTimestamp() });
              setUserData(updatedData);
            } else {
              await updateDoc(userRef, { lastActive: serverTimestamp() });
              setUserData({ ...existingData, lastActive: new Date() });
            }
          } else {
            let newAccountId = 0;
            
            if (firebaseUser.email === 'tatobeats@outlook.com') {
              newAccountId = 1;
            } else {
              // Sequential ID logic starting from 100
              try {
                const counterRef = doc(db, 'settings', 'counters');
                await runTransaction(db, async (transaction) => {
                  const counterSnap = await transaction.get(counterRef);
                  let nextId = 100;
                  if (counterSnap.exists()) {
                    nextId = (counterSnap.data().lastAccountId || 99) + 1;
                  }
                  transaction.set(counterRef, { lastAccountId: nextId }, { merge: true });
                  newAccountId = nextId;
                });
              } catch (err) {
                console.error("Erro ao gerar ID, usando fallback randômico:", err);
                newAccountId = Math.floor(100 + Math.random() * 900);
              }
            }

            const newData: UserData = {
              displayName: firebaseUser.displayName || 'Cidadão',
              role: firebaseUser.email === 'tatobeats@outlook.com' ? 'admin' : 'player',
              coins: 0,
              diamonds: 0,
              avatarUrl: firebaseUser.photoURL || '',
              accountId: newAccountId,
              lastActive: serverTimestamp()
            };
            await setDoc(userRef, newData);
            setUserData(newData);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUserData(null);
      }
      setIsAuthLoading(false);
    });
    return () => {
      unsubSettings();
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentPage('home');
  };

  const [adminAuthCode, setAdminAuthCode] = useState('');
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would be a server-side check. 
    // Here we use a code 'verdinha2026' as requested.
    if (adminAuthCode === 'verdinha2026' && user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { role: 'admin' });
      setUserData(prev => prev ? { ...prev, role: 'admin' } : null);
      setIsAdminAuthOpen(false);
      setAdminAuthCode('');
      setCurrentPage('admin');
    } else {
      alert('Código ou Usuário incorreto.');
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-verdinha">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Diamond size={48} />
        </motion.div>
      </div>
    );
  }  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#020202] text-white p-6 relative overflow-hidden">
        {/* Cinematic Backdrop with Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={settings.backgroundUrl} 
            alt="City Background" 
            className="w-full h-full object-cover grayscale-[20%] brightness-[0.4]" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020202] via-transparent to-transparent" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="z-10 text-center space-y-12 max-w-lg w-full"
        >
          <div className="relative inline-block group">
            <div className="absolute inset-0 bg-verdinha/20 blur-[60px] rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            <Logo 
              size="lg" 
              url={settings.logoUrl}
              className="relative z-10 transition-transform duration-700" 
            />
          </div>
          
          <div className="bg-white/[0.02] backdrop-blur-3xl border border-white/[0.05] p-12 rounded-[2rem] space-y-10 shadow-2xl relative overflow-hidden">
            <div className="space-y-3">
              <h2 className="text-sm font-black text-verdinha tracking-[0.4em] uppercase underline decoration-verdinha/20 underline-offset-4">Portal Restrito</h2>
              <p className="text-white/60 text-sm font-medium tracking-wide">Autentique-se para acessar a rede Verdinha.</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleLogin}
                className="w-full py-4 bg-white text-black font-heavy tracking-tighter text-lg rounded-xl hover:bg-verdinha transition-all duration-500 flex items-center justify-center gap-3 group relative overflow-hidden"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5 invert" alt="G" />
                ENTRAR COM GOOGLE
              </button>

              <button 
                className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-heavy tracking-tighter text-lg rounded-xl transition-all duration-500 flex items-center justify-center gap-3 group relative overflow-hidden shadow-lg shadow-[#5865F2]/10"
                onClick={() => alert('Integração com Discord em breve! Aproveite sua cidadania.')}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>
                </div>
                ENTRAR COM DISCORD
              </button>
            </div>
            
            <div className="pt-8 border-t border-white/[0.05] flex items-center justify-center gap-6 opacity-40">
              <span className="text-[9px] font-black uppercase tracking-[0.3em]">Ambiente • Minimalista</span>
              <span className="w-1 h-1 bg-white/20 rounded-full" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em]">Operação • Brasil</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const navigate = (page: Page) => {
    setCurrentPage(page);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#050505] overflow-hidden relative">
      {/* Cinematic Global Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img 
          src={settings.backgroundUrl} 
          alt="Atmosphere" 
          className="w-full h-full object-cover transition-opacity duration-1000" 
        />
        {/* 70% Black Overlay - Managed for perfect contrast */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px]" />
      </div>

      {/* Sidebar Overlay for mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside 
        animate={{ x: isSidebarOpen ? 0 : -300 }}
        className={cn(
          "fixed lg:static inset-y-0 left-0 w-80 bg-glass border-r border-white/5 z-50 transition-all duration-500 flex flex-col",
          !isSidebarOpen && "lg:w-0 lg:overflow-hidden lg:border-none"
        )}
      >
        <div className="p-10 pb-6">
          <Logo size="sm" align="left" url={settings.logoUrl} />
        </div>

        <nav className="flex-1 px-6 space-y-2 mt-4">
          <NavItem active={currentPage === 'home'} icon={<Home size={18} />} label="Início" onClick={() => navigate('home')} />
          <NavItem active={currentPage === 'whitelist'} icon={<BookOpen size={18} />} label="Whitelist" onClick={() => navigate('whitelist')} />
          <NavItem active={currentPage === 'rules'} icon={<ShieldCheck size={18} />} label="Regulamento" onClick={() => navigate('rules')} />
          <NavItem active={currentPage === 'store'} icon={<ShoppingBag size={18} />} label="Marketplace" onClick={() => navigate('store')} />
          <NavItem active={currentPage === 'faq'} icon={<MessageCircleQuestion size={18} />} label="FAQs" onClick={() => navigate('faq')} />
          <NavItem active={currentPage === 'orgs'} icon={<Users size={18} />} label="Facções" onClick={() => navigate('orgs')} />
          <NavItem active={currentPage === 'support'} icon={<LifeBuoy size={18} />} label="Central Staff" onClick={() => navigate('support')} />
          
          {['admin', 'diretor', 'administrador', 'coordenador', 'moderador', 'suporte'].includes(userData?.role || '') && (
            <NavItem 
              active={currentPage === 'admin'} 
              icon={<Settings size={18} />} 
              label="Painel Staff" 
              onClick={() => navigate('admin')}
              className="text-verdinha/60 hover:text-verdinha mt-12 border-t border-white/5 pt-6"
            />
          )}
        </nav>

        <div className="p-4 mt-auto border-t border-verdinha/5">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full p-3 text-[#555] hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all font-medium text-sm"
          >
            <LogOut size={18} />
            Desconectar Portal
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-transparent">
        {/* Header */}
        <header className="h-24 border-b border-white/5 flex items-center justify-between px-8 lg:px-12 bg-black/20 backdrop-blur-2xl z-30 sticky top-0">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-3 bg-white/[0.03] border border-white/5 hover:border-verdinha/30 rounded-xl text-white/40 hover:text-verdinha transition-all"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block">
              <h3 className="font-black text-xs text-verdinha uppercase tracking-[0.4em] leading-none mb-1">Localização</h3>
              <p className="font-bold text-lg text-white capitalize leading-none tracking-tighter italic">
                {currentPage === 'home' && 'Início'}
                {currentPage === 'whitelist' && 'Material Whitelist'}
                {currentPage === 'rules' && 'Cód. Penal'}
                {currentPage === 'store' && 'Marketplace VIP'}
                {currentPage === 'faq' && 'Dúvidas Gerais'}
                {currentPage === 'orgs' && 'Grupamentos & Facções'}
                {currentPage === 'support' && 'Suporte Staff'}
                {currentPage === 'admin' && 'Central de Dados'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-8">
            <div className="flex items-center gap-6 px-6 py-3 bg-white/[0.02] border border-white/5 rounded-2xl hidden md:flex">
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">Câmbio Local</span>
                <span className="font-mono text-sm font-black text-white/60 leading-none">R$ {userData?.coins.toLocaleString()}</span>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-black text-verdinha uppercase tracking-widest leading-none mb-1">Créditos VIP</span>
                <div className="flex items-center gap-1.5">
                  <Diamond size={10} className="text-verdinha" />
                  <span className="font-mono text-sm font-black text-verdinha leading-none">{userData?.diamonds.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 pl-4 border-l border-white/5">
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-2 mb-1">
                  <p className="text-sm font-black text-white leading-none uppercase italic">
                    {userData?.accountId && (
                      <span className="text-verdinha/60 mr-1.5 text-[10px] tracking-tight not-italic font-mono">ID# {userData.accountId}</span>
                    )}
                    {userData?.displayName}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] leading-none">
                    {userData?.role === 'admin' ? 'Fundador' : 
                     userData?.role === 'diretor' ? 'Diretor' :
                     userData?.role === 'administrador' ? 'Administrador' :
                     userData?.role === 'coordenador' ? 'Coordenador' :
                     userData?.role === 'moderador' ? 'Moderador' :
                     userData?.role === 'suporte' ? 'Suporte' : 'Morador'}
                  </p>
                  {!['admin', 'diretor', 'administrador', 'coordenador', 'moderador', 'suporte'].includes(userData?.role || '') && (
                    <button 
                      onClick={() => setIsAdminAuthOpen(true)}
                      className="text-[10px] text-white/10 hover:text-verdinha transition-colors uppercase font-black tracking-tighter"
                    >
                      • STAFF
                    </button>
                  )}
                </div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 p-0.5 relative group cursor-pointer overflow-hidden transition-all duration-500 hover:border-verdinha/50">
                <div className="absolute inset-0 bg-verdinha/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {userData?.avatarUrl ? (
                  <img src={userData.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-[14px]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/10 rounded-[14px]">
                    <UserIcon size={24} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Admin Auth Modal */}
        <AnimatePresence>
          {isAdminAuthOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#0f0f0f] border border-verdinha/20 p-10 rounded-[40px] max-w-sm w-full space-y-8 shadow-[0_0_100px_-20px_#22c55e44]"
              >
                <div className="text-center space-y-2">
                  <div className="p-4 bg-verdinha/10 rounded-3xl w-fit mx-auto mb-4">
                    <ShieldCheck size={40} className="text-verdinha" />
                  </div>
                  <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Área Restrita</h3>
                  <p className="text-sm text-[#555] font-medium italic">Insira o código de autorização.</p>
                </div>
                <form onSubmit={handleAdminAuth} className="space-y-4">
                  <div className="space-y-2">
                    <input 
                      type="password" 
                      placeholder="Código Admin"
                      value={adminAuthCode}
                      onChange={e => setAdminAuthCode(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-xl font-bold tracking-[0.5em] text-verdinha focus:outline-none focus:border-verdinha transition-all"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setIsAdminAuthOpen(false)}
                      className="flex-1 py-4 text-[#555] font-bold hover:text-white transition-colors"
                    >
                      VOLTAR
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] py-4 bg-verdinha text-black font-black italic rounded-2xl hover:bg-verdinha-light transition-all shadow-[0_0_20px_-5px_#22c55e]"
                    >
                      AUTENTICAR
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto h-full"
            >
              {currentPage === 'home' && <HomeSection userData={userData} navigate={navigate} settings={settings} />}
              {currentPage === 'whitelist' && <WhitelistSection />}
              {currentPage === 'rules' && <RulesSection />}
              {currentPage === 'store' && <StoreSection userData={userData} />}
              {currentPage === 'faq' && <FAQSection />}
              {currentPage === 'orgs' && <OrgsSection />}
              {currentPage === 'support' && <SupportSection user={user} isAdmin={['admin', 'diretor', 'administrador', 'coordenador', 'moderador', 'suporte'].includes(userData?.role || '')} />}
              {currentPage === 'admin' && ['admin', 'diretor', 'administrador', 'coordenador', 'moderador', 'suporte'].includes(userData?.role || '') && <AdminSection />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Discord-style Online Sidebar */}
        <OnlineCitizensDashboard users={onlineUsers} />
      </main>
    </div>
  );
}

function OnlineCitizensDashboard({ users }: { users: any[] }) {
  const staffRolesOrder: UserRole[] = ['admin', 'diretor', 'administrador', 'coordenador', 'moderador', 'suporte', 'player'];
  
  const roleLabels: Record<UserRole, string> = {
    admin: 'Fundadores',
    diretor: 'Diretoria',
    administrador: 'Administração',
    coordenador: 'Coordenação',
    moderador: 'Moderação',
    suporte: 'Suporte',
    player: 'Moradores'
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'text-verdinha',
    diretor: 'text-red-500',
    administrador: 'text-orange-400',
    coordenador: 'text-yellow-400',
    moderador: 'text-blue-400',
    suporte: 'text-green-400',
    player: 'text-white/40'
  };

  return (
    <div className="hidden 2xl:flex w-72 h-[calc(100vh-6rem)] mt-24 border-l border-white/5 bg-black/20 backdrop-blur-3xl flex-col p-6 sticky top-24 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Cidadãos On-line</h3>
        <span className="text-[10px] font-mono font-black text-verdinha bg-verdinha/10 px-2 py-0.5 rounded tracking-tighter">
          {users.length}
        </span>
      </div>

      <div className="space-y-8">
        {staffRolesOrder.map(role => {
          const usersInRole = users.filter(u => u.role === role);
          if (usersInRole.length === 0) return null;

          return (
            <div key={role} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className={cn("text-[10px] font-black uppercase tracking-widest leading-none", roleColors[role])}>
                  {roleLabels[role]}
                </span>
                <span className="h-px flex-1 bg-white/[0.03]" />
                <span className="text-[8px] font-mono text-white/10">{usersInRole.length}</span>
              </div>

              <div className="space-y-3">
                {usersInRole.map(u => (
                  <div key={u.id} className="flex items-center gap-3 group cursor-pointer hover:bg-white/[0.02] p-1.5 rounded-xl transition-all">
                    <div className="relative w-8 h-8 shrink-0">
                      <img 
                        src={u.avatarUrl || 'https://via.placeholder.com/150'} 
                        className="w-full h-full rounded-lg object-cover bg-white/5" 
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-verdinha border-2 border-black rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-[11px] font-bold truncate tracking-tight transition-colors", roleColors[role === 'player' ? 'player' : role])}>
                        <span className="text-white/20 mr-1.5 font-mono">#{u.accountId}</span>
                        {u.displayName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavItem({ active, icon, label, onClick, className }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 w-full p-4 rounded-2xl transition-all duration-300 text-sm group",
        active 
          ? "bg-verdinha text-black font-bold shadow-[0_0_20px_-5px_#22c55e]" 
          : "text-[#666] hover:text-white hover:bg-verdinha/5",
        className
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active ? "text-black" : "text-verdinha/50")}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// --- Sections ---

function HomeSection({ userData, navigate, settings }: { userData: UserData | null; navigate: (p: Page) => void; settings: SettingsData }) {
  const handleConnect = () => {
    if (settings.fivemCfxId) {
      window.location.href = `fivem://connect/${settings.fivemCfxId}`;
    } else if (settings.serverIp) {
      window.location.href = `fivem://connect/${settings.serverIp}`;
    } else {
      alert('O servidor FiveM ainda não foi configurado pelo administrador.');
    }
  };

  return (
    <div className="space-y-16 py-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 px-4">
        <div className="space-y-4 max-w-2xl">
          <h2 className="text-sm font-black tracking-[0.4em] text-verdinha uppercase italic">Sistemas • Dashboard</h2>
          <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-white uppercase italic leading-none">
            BEM-VINDO, {userData?.displayName}
            {userData?.accountId && (
              <span className="text-verdinha opacity-20 ml-4 text-3xl sm:text-5xl not-italic font-mono">#{userData.accountId}</span>
            )}
          </h1>
          <p className="text-white/30 font-medium text-lg leading-relaxed border-l border-verdinha/20 pl-6">
            Portal oficial de cidadania. Controle seus recursos e acessos de forma simplificada em uma interface de alta performance.
          </p>
        </div>
        
        <button 
          onClick={handleConnect}
          className="group relative flex items-center gap-6 p-1 bg-white/5 border border-white/10 rounded-[2.5rem] hover:bg-white hover:border-white transition-all duration-700 shadow-2xl overflow-hidden shrink-0"
        >
          <div className="absolute inset-0 bg-verdinha/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10 py-6 px-10 flex flex-col items-start gap-1">
            <span className="text-[10px] font-black text-verdinha group-hover:text-black/40 uppercase tracking-[0.4em] transition-colors">Servidor: Online</span>
            <span className="text-2xl font-black text-white group-hover:text-black uppercase italic tracking-tighter transition-colors">JOGAR AGORA</span>
          </div>
          <div className="relative z-10 w-20 h-20 bg-verdinha rounded-[2rem] flex items-center justify-center m-1 group-hover:bg-black transition-colors duration-700">
            <ExternalLink size={32} className="text-black group-hover:text-verdinha transition-colors" />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4">
        <HomeCard 
          title="Whitelist" 
          description="Documentação oficial e prova de cidadania para novos moradores." 
          icon={<ShieldCheck size={24} className="text-verdinha" />} 
          buttonText="Iniciar Processo" 
          onClick={() => navigate('whitelist')} 
        />
        <HomeCard 
          title="Marketplace" 
          description="Acesse o catálogo de itens VIP, veículos e planos exclusivos." 
          icon={<ShoppingBag size={24} className="text-verdinha" />} 
          buttonText="Explorar Loja" 
          onClick={() => navigate('store')} 
        />
        <HomeCard 
          title="Central de Suporte" 
          description="Abra tickets para suporte técnico ou financeiro com nossa staff." 
          icon={<LifeBuoy size={24} className="text-verdinha" />} 
          buttonText="Abrir Ticket" 
          onClick={() => navigate('support')} 
        />
      </div>

      <div className="mx-4 overflow-hidden rounded-[3rem] relative bg-white/[0.01] border border-white/[0.05] p-12 lg:p-16">
        <div className="absolute inset-0 bg-gradient-to-br from-verdinha/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-12">
          <div className="space-y-6 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-verdinha/10 border border-verdinha/20 rounded-full text-[10px] font-black text-verdinha tracking-[0.2em] uppercase">
              Aviso • Discord
            </div>
            <h3 className="text-4xl font-black text-white italic uppercase tracking-tight">Sincronização de API</h3>
            <p className="text-white/30 text-lg leading-relaxed">
              Estamos preparando a integração completa com o Discord. Em breve você poderá conectar sua conta e sincronizar cargos automaticamente através de uma API segura.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
               <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.05]">
                  <div className="w-2 h-2 bg-verdinha rounded-full animate-pulse shadow-[0_0_10px_#22c55e]" />
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest leading-none">Base de Dados: Online</span>
               </div>
               <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.05]">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest leading-none">OAuth Integrado</span>
               </div>
            </div>
          </div>
          <button 
            onClick={() => alert('Envie sua API para integração!')}
            className="px-12 py-6 bg-white text-black font-black uppercase italic rounded-2xl hover:bg-verdinha transition-all duration-500 shadow-[0_0_40px_-10px_rgba(255,255,255,0.2)] whitespace-nowrap"
          >
            Saber Mais <ChevronRight size={20} className="inline ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeCard({ title, description, icon, buttonText, onClick }: { title: string; description: string; icon: React.ReactNode; buttonText: string; onClick: () => void }) {
  return (
    <div className="bg-black/40 backdrop-blur-md border border-verdinha/5 p-8 rounded-3xl space-y-6 hover:border-verdinha/20 transition-colors group">
      <div className="p-3 bg-verdinha/5 rounded-2xl w-fit group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="space-y-2">
        <h4 className="text-xl font-bold text-white">{title}</h4>
        <p className="text-[#666] text-sm leading-relaxed">{description}</p>
      </div>
      <button 
        onClick={onClick}
        className="text-verdinha font-bold text-sm flex items-center gap-2 hover:gap-3 transition-all"
      >
        {buttonText} <ChevronRight size={16} />
      </button>
    </div>
  );
}

function WhitelistSection() {
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'whitelistDocs'), orderBy('order', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'whitelistDocs'));
  }, []);

  return (
    <div className="space-y-16 py-8 px-4 text-minimal">
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-sm font-black tracking-[0.4em] text-verdinha uppercase italic">Legal • Onboarding</h2>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white uppercase italic leading-none">
          ESTUDO <span className="text-verdinha">WHITELIST</span>
        </h1>
        <p className="text-white/30 font-medium text-lg border-l border-verdinha/20 pl-6">
          Acesse os materiais oficiais para aprovação na cidadania da cidade Verdinha.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {docs.length === 0 ? (
          <div className="py-32 text-center bg-glass border border-dashed border-white/5 rounded-[3rem]">
            <p className="text-white/10 text-xs font-black uppercase tracking-[0.5em]">Nenhum material disponível</p>
          </div>
        ) : (
          docs.map(d => (
            <div key={d.id} className="p-12 bg-glass border border-white/5 rounded-[3rem] space-y-8 group hover:border-verdinha/10 transition-all duration-700">
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tight group-hover:text-verdinha transition-colors">{d.title}</h3>
                <div className="h-1 w-12 bg-verdinha/20 rounded-full" />
              </div>
              <div className="text-white/40 font-medium text-lg leading-relaxed max-w-4xl">
                {d.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'rules'), orderBy('category', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setRules(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rules'));
  }, []);

  const categories = Array.from(new Set(rules.map(r => r.category)));

  return (
    <div className="space-y-16 py-8 px-4 text-minimal">
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-sm font-black tracking-[0.4em] text-verdinha uppercase italic">Conduta • Diretrizes</h2>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white uppercase italic leading-none">
          CÓDIGO DE <span className="text-verdinha">CONDUTA</span>
        </h1>
        <p className="text-white/30 font-medium text-lg border-l border-verdinha/20 pl-6">
          Diretrizes essenciais para manter a ordem e a imersão na cidade. O não cumprimento pode resultar em sanções definitivas.
        </p>
      </div>

      <div className="space-y-20">
        {categories.length === 0 ? (
          <div className="py-32 text-center bg-glass border border-dashed border-white/5 rounded-[3rem]">
            <p className="text-white/10 text-xs font-black uppercase tracking-[0.5em]">Sem registros oficiais</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat} className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-white/5" />
                <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.5em] italic shrink-0 px-4">{cat}</h3>
                <div className="h-px flex-1 bg-white/5" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rules.filter(r => r.category === cat).map(r => (
                  <div key={r.id} className="p-10 bg-glass border border-white/5 rounded-[2.5rem] hover:border-white/10 transition-all duration-500">
                    <h4 className="text-lg font-black text-white uppercase italic mb-4">{r.title}</h4>
                    <p className="text-white/30 text-sm leading-relaxed font-medium">{r.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StoreSection({ userData }: { userData: UserData | null }) {
  const [items, setItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'storeItems'), orderBy('price', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'storeItems'));
  }, []);

  const filteredItems = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);

  return (
    <div className="space-y-24 py-12 px-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
        <div className="space-y-6 max-w-3xl">
          <h2 className="text-sm font-black tracking-[0.5em] text-verdinha uppercase italic opacity-70">Coleção • Suprema</h2>
          <h1 className="text-6xl sm:text-9xl font-black tracking-tighter text-white uppercase italic leading-[0.8]">
            CATÁLOGO <br />
            <span className="text-verdinha">DE ELITE</span>
          </h1>
          <div className="h-px w-24 bg-verdinha/40 mt-8" />
          <p className="text-white/40 font-medium text-xl leading-relaxed max-w-xl">
            Recursos exclusivos para quem não aceita o comum. Redefina sua autoridade.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 bg-white/[0.02] backdrop-blur-3xl border border-white/5 p-2 rounded-[2rem] h-fit">
          {['all', 'cars', 'real_estate', 'plans'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-700",
                activeTab === tab 
                  ? "bg-white text-black shadow-[0_20px_50px_rgba(255,255,255,0.1)] scale-105" 
                  : "text-white/30 hover:text-white hover:bg-white/5"
              )}
            >
              {tab === 'all' ? 'Tudo' : tab === 'cars' ? 'Garagem' : tab === 'real_estate' ? 'Mansões' : 'Privilégios'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
        {filteredItems.map(item => (
          <motion.div 
            layout
            key={item.id} 
            className="group relative flex flex-col h-full"
          >
            {/* Background Glow */}
            <div className="absolute -inset-4 bg-verdinha/5 blur-3xl rounded-[4rem] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
            
            <div className="relative aspect-[16/11] bg-black/40 rounded-[3rem] overflow-hidden border border-white/5 group-hover:border-verdinha/30 transition-all duration-1000">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-[3000ms] ease-out" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/5">
                  <ShoppingBag size={80} strokeWidth={0.5} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
              
              <div className="absolute top-8 left-8 flex items-center gap-3 bg-black/60 backdrop-blur-2xl border border-white/10 px-5 py-2.5 rounded-full">
                <Diamond size={14} className="text-verdinha group-hover:animate-pulse" />
                <span className="font-mono text-sm font-black text-white tracking-widest">{item.price.toLocaleString()}</span>
              </div>
            </div>
            
            <div className="pt-10 px-4 flex-1 flex flex-col">
              <div className="mb-auto space-y-4">
                <div className="flex items-center gap-3">
                  <span className="h-[2px] w-4 bg-verdinha" />
                  <p className="text-[10px] text-verdinha font-black uppercase tracking-[0.4em] italic">{item.category}</p>
                </div>
                <h4 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">{item.name}</h4>
                <p className="text-white/30 text-sm font-medium leading-relaxed line-clamp-3">{item.description}</p>
              </div>

              <div className="mt-12">
                <button 
                  onClick={() => window.open('https://discord.gg/verdinha', '_blank')}
                  className={cn(
                    "w-full py-6 rounded-[2rem] font-black uppercase italic tracking-[0.4em] text-[10px] transition-all duration-1000 relative overflow-hidden border border-white/5",
                    userData && userData.diamonds < item.price 
                      ? "bg-white/5 text-white/10 cursor-not-allowed" 
                      : "bg-white/5 text-white hover:bg-white hover:text-black hover:shadow-[0_20px_40px_rgba(255,255,255,0.05)]"
                  )}
                  disabled={userData && userData.diamonds < item.price}
                >
                  <span className="relative z-10">
                    {userData && userData.diamonds < item.price ? 'SALDO INSUFICIENTE' : 'ADQUIRIR AGORA'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FAQSection() {
  const [faqs, setFaqs] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'faqs'));
    return onSnapshot(q, (snapshot) => {
      setFaqs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'faqs'));
  }, []);

  const categories = Array.from(new Set(faqs.map(f => f.category)));

  return (
    <div className="space-y-16 py-8 px-4 text-minimal">
      <div className="space-y-4 max-w-2xl text-minimal">
        <h2 className="text-sm font-black tracking-[0.4em] text-verdinha uppercase italic">Suporte • Conhecimento</h2>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white uppercase italic leading-none">
          DÚVIDAS <span className="text-verdinha">FREQUENTES</span>
        </h1>
        <p className="text-white/30 font-medium text-lg border-l border-verdinha/20 pl-6">
          Encontre respostas rápidas para as mecânicas da cidade e comandos essenciais.
        </p>
      </div>

      <div className="space-y-12">
        {categories.map(cat => (
          <div key={cat} className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-white/5" />
              <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.5em] italic shrink-0 px-4">{cat}</h3>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {faqs.filter(f => f.category === cat).map(faq => (
                <div key={faq.id} className="p-8 bg-glass border border-white/5 rounded-[2rem] hover:border-white/10 transition-all duration-500 group">
                  <h4 className="text-lg font-black text-white uppercase italic mb-3 group-hover:text-verdinha transition-colors">{faq.question}</h4>
                  <p className="text-white/30 text-sm leading-relaxed font-medium">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgsSection() {
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'organizations'));
    return onSnapshot(q, (snapshot) => {
      setOrgs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'organizations'));
  }, []);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-4xl font-black text-white italic uppercase">Organizações & <span className="text-verdinha">Grupos</span></h2>
        <p className="text-[#888]">Confira as facções, departamentos e grupos disponíveis para assumir.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {orgs.map(org => (
          <div key={org.id} className="bg-[#0f0f0f] border border-verdinha/10 rounded-3xl overflow-hidden flex flex-col md:flex-row">
            <div className="w-full md:w-48 aspect-square bg-[#111] overflow-hidden">
              {org.imageUrl ? (
                <img src={org.imageUrl} alt={org.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-verdinha/20">
                  <Users size={64} />
                </div>
              )}
            </div>
            <div className="flex-1 p-8 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                      org.type === 'police' ? "bg-blue-500 text-white" : org.type === 'illegal' ? "bg-red-500 text-white" : "bg-verdinha text-black"
                    )}>
                      {org.type === 'police' ? 'POLÍCIA' : org.type === 'illegal' ? 'ILEGAL' : 'CIVIL'}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                      org.status === 'open' ? "bg-verdinha/20 text-verdinha" : "bg-red-500/20 text-red-500"
                    )}>
                      {org.status === 'open' ? 'DISPONÍVEL' : 'OCUPADO'}
                    </span>
                  </div>
                  <h4 className="text-2xl font-bold text-white uppercase italic">{org.name}</h4>
                </div>
              </div>
              
              <div className="space-y-4">
                <p className="text-xs text-[#666] leading-relaxed line-clamp-3">{org.description}</p>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-verdinha font-bold uppercase tracking-[0.2em] mb-2">Requisitos</p>
                  <p className="text-xs text-[#aaa] font-medium leading-relaxed">{org.requirements}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupportSection({ user, isAdmin }: { user: FirebaseUser | null; isAdmin?: boolean }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = isAdmin 
      ? query(collection(db, 'supportTickets'), orderBy('lastUpdate', 'desc'))
      : query(collection(db, 'supportTickets'), where('userId', '==', user.uid), orderBy('lastUpdate', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      setTickets(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'supportTickets'));
  }, [user, isAdmin]);

  useEffect(() => {
    if (!selectedTicket) return;
    const q = query(collection(db, 'supportTickets', selectedTicket.id, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `supportTickets/${selectedTicket.id}/messages`));
  }, [selectedTicket]);

  const handleCreateTicket = async () => {
    if (!user || !newSubject) return;
    try {
      const res = await addDoc(collection(db, 'supportTickets'), {
        userId: user.uid,
        userName: user.displayName,
        subject: newSubject,
        status: 'open',
        createdAt: serverTimestamp(),
        lastUpdate: serverTimestamp()
      });
      setShowCreate(false);
      setNewSubject('');
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!user || !newMessage || !selectedTicket) return;
    try {
      const msgData = {
        senderId: user.uid,
        senderName: user.displayName,
        message: newMessage,
        timestamp: serverTimestamp(),
        isAdmin: isAdmin || false
      };
      await addDoc(collection(db, 'supportTickets', selectedTicket.id, 'messages'), msgData);
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        lastUpdate: serverTimestamp(),
        status: isAdmin ? 'in_progress' : 'open'
      });
      setNewMessage('');
    } catch (e) { console.error(e); }
  };

  const closeTicket = async (id: string) => {
    await updateDoc(doc(db, 'supportTickets', id), { status: 'closed', lastUpdate: serverTimestamp() });
    if (selectedTicket?.id === id) setSelectedTicket({ ...selectedTicket, status: 'closed' });
  };

  return (
    <div className="h-[calc(100vh-10rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-80 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-white uppercase italic">Meus <span className="text-verdinha">Tickets</span></h2>
          <button 
            onClick={() => setShowCreate(true)}
            className="p-2 bg-verdinha text-black rounded-xl hover:bg-verdinha-light transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className={cn(
                "w-full text-left p-4 rounded-2xl border transition-all space-y-2",
                selectedTicket?.id === t.id 
                  ? "bg-verdinha/10 border-verdinha shadow-[0_0_15px_-5px_#22c55e]" 
                  : "bg-[#0f0f0f] border-white/5 hover:border-verdinha/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest",
                  t.status === 'open' ? "bg-verdinha text-black" : t.status === 'in_progress' ? "bg-blue-500 text-white" : "bg-red-500 text-white"
                )}>
                  {t.status === 'open' ? 'Aberto' : t.status === 'in_progress' ? 'Em Análise' : 'Finalizado'}
                </span>
                <span className="text-[10px] text-[#555] font-mono">
                  {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : ''}
                </span>
              </div>
              <h4 className="font-bold text-white text-sm line-clamp-1">{t.subject}</h4>
              {isAdmin && <p className="text-[10px] text-verdinha font-medium truncate">AUTOR: {t.userName}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 bg-[#0f0f0f] rounded-3xl border border-verdinha/10 flex flex-col overflow-hidden relative">
        <AnimatePresence>
          {showCreate ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0d0d0d] z-20 flex flex-col items-center justify-center p-10 text-center"
            >
              <div className="max-w-md w-full space-y-8">
                <div className="space-y-4">
                  <div className="p-4 bg-verdinha/10 rounded-full w-fit mx-auto">
                    <LifeBuoy size={32} className="text-verdinha" />
                  </div>
                  <h3 className="text-4xl font-black text-white uppercase italic">NOVO TICKET</h3>
                  <p className="text-[#666]">Descreva o assunto do seu problema para que nossa equipe possa te ajudar com precisão.</p>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Assunto do Ticket..."
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-verdinha focus:ring-1 focus:ring-verdinha transition-all"
                  />
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowCreate(false)}
                      className="flex-1 py-4 text-[#555] font-bold hover:text-white transition-all"
                    >
                      CANCELAR
                    </button>
                    <button 
                      onClick={handleCreateTicket}
                      disabled={!newSubject}
                      className="flex-[2] py-4 bg-verdinha disabled:opacity-50 text-black font-bold rounded-2xl hover:bg-verdinha-light transition-all shadow-[0_0_20px_-5px_#22c55e]"
                    >
                      CRIAR TICKET
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : !selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#444] p-10 text-center gap-4">
              <LifeBuoy size={64} className="opacity-20" />
              <div>
                <p className="text-xl font-bold uppercase italic tracking-tighter">Selecione um Ticket</p>
                <p className="text-sm font-medium">Ou crie um novo para falar com a staff.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="p-6 border-b border-verdinha/10 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-white text-lg">{selectedTicket.subject}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                      selectedTicket.status === 'open' ? "bg-verdinha text-black" : "bg-red-500 text-white"
                    )}>
                      {selectedTicket.status === 'open' ? 'AGUARDANDO STAFF' : 'ENCERRADO'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#555] font-mono tracking-widest leading-none">ID: {selectedTicket.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  {selectedTicket.status !== 'closed' && (
                    <button 
                      onClick={() => closeTicket(selectedTicket.id)}
                      className="text-xs font-bold text-red-500/60 hover:text-red-500 transition-colors uppercase italic"
                    >
                      Fechar Ticket
                    </button>
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map(m => {
                  const isMe = m.senderId === user.uid;
                  return (
                    <div key={m.id} className={cn("flex flex-col max-w-[80%] space-y-1", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                      <span className="text-[10px] font-bold text-[#555] uppercase tracking-widest px-2">{m.senderName}</span>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed",
                        isMe 
                          ? "bg-verdinha text-black font-medium rounded-tr-none" 
                          : "bg-white/5 text-[#aaa] border border-white/10 rounded-tl-none"
                      )}>
                        {m.message}
                      </div>
                      <span className="text-[8px] text-[#444] font-mono px-2">
                        {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              {selectedTicket.status !== 'closed' && (
                <div className="p-6 border-t border-verdinha/10 bg-black/40">
                  <div className="relative group">
                    <input 
                      type="text" 
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                      className="w-full bg-[#111] border border-white/10 rounded-2xl pl-6 pr-16 py-4 text-white hover:border-verdinha/30 focus:outline-none focus:border-verdinha transition-all"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!newMessage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-verdinha text-black rounded-xl hover:bg-verdinha-light disabled:opacity-50 transition-all shadow-[0_0_15px_-5px_#22c55e]"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AdminSection() {
  const [activeTab, setActiveTab] = useState<'store' | 'orgs' | 'faqs' | 'rules' | 'whitelist' | 'users' | 'settings'>('store');
  const [items, setItems] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState<any | null>(null);

  const tabs = [
    { id: 'store', label: 'Marketplace' },
    { id: 'orgs', label: 'Organizações' },
    { id: 'faqs', label: 'Ajuda' },
    { id: 'rules', label: 'Regulamento' },
    { id: 'whitelist', label: 'Cidadania' },
    { id: 'users', label: 'Cidadãos' },
    { id: 'settings', label: 'Configurações' }
  ];

  // General CRUD logic
  const collectionName = {
    store: 'storeItems',
    orgs: 'organizations',
    faqs: 'faqs',
    rules: 'rules',
    whitelist: 'whitelistDocs',
    users: 'users',
    settings: 'settings'
  }[activeTab];

  useEffect(() => {
    if (activeTab === 'settings') return;
    const q = activeTab === 'users' ? query(collection(db, 'users')) : query(collection(db, collectionName), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, collectionName));
  }, [activeTab]);

  // Management functions for currencies
  const handleUpdateCurrency = async (userId: string, field: 'diamonds' | 'coins', amount: number) => {
    if (isNaN(amount)) return;
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const current = userSnap.data()[field] || 0;
        await updateDoc(userRef, { [field]: current + amount });
        alert(`Sucesso! ${amount > 0 ? 'Adicionado' : 'Removido'} com sucesso.`);
      }
    } catch(err) {
      console.error(err);
      alert('Erro ao atualizar saldo.');
    }
  };

  // Management functions for users
  const handleUpdateUserBasic = async (userId: string, field: string, value: any) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { [field]: value });
      alert('Dados atualizados com sucesso!');
    } catch(err) {
      console.error(err);
      alert('Erro ao atualizar dados do cidadão.');
    }
  };

  const staffRoles: { id: UserRole; label: string; color: string }[] = [
    { id: 'player', label: 'Morador', color: 'bg-white/10 text-white/40' },
    { id: 'suporte', label: 'Suporte', color: 'bg-green-500/20 text-green-400' },
    { id: 'moderador', label: 'Moderador', color: 'bg-blue-500/20 text-blue-400' },
    { id: 'coordenador', label: 'Coordenador', color: 'bg-yellow-500/20 text-yellow-400' },
    { id: 'administrador', label: 'Administrador', color: 'bg-orange-500/20 text-orange-400' },
    { id: 'diretor', label: 'Diretor', color: 'bg-red-500/20 text-red-500' },
    { id: 'admin', label: 'Fundador', color: 'bg-verdinha text-black' },
  ];

  const [searchTerm, setSearchTerm] = useState('');
  const filteredUsers = items.filter(u => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.accountId?.toString().includes(searchTerm)
  );

  // Settings specific
  const [settingsData, setSettingsData] = useState<SettingsData>({ backgroundUrl: '', logoUrl: '', fivemCfxId: '', serverIp: '' });
  useEffect(() => {
    if (activeTab === 'settings') {
      getDoc(doc(db, 'settings', 'global')).then(snap => {
        if (snap.exists()) setSettingsData(snap.data() as SettingsData);
      });
    }
  }, [activeTab]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await setDoc(doc(db, 'settings', 'global'), settingsData);
    alert('Configurações aplicadas com sucesso!');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Atenção: Esta ação é irreversível. Deseja realmente excluir este registro?')) {
      try {
        await deleteDoc(doc(db, collectionName, id));
      } catch(e) {
        console.error("Falha na exclusão:", e);
      }
    }
  };

  const [formData, setFormData] = useState<any>({});

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing?.id) {
        await updateDoc(doc(db, collectionName, isEditing.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, collectionName), {
          ...formData,
          createdAt: serverTimestamp(),
          order: items.length
        });
      }
      setIsEditing(null);
      setFormData({});
    } catch(err) {
      alert('Erro ao salvar dados. Verifique o console.');
      console.error(err);
    }
  };

  return (
    <div className="space-y-12 py-8 px-4 text-minimal">
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-sm font-black tracking-[0.4em] text-verdinha uppercase italic">Sistema • Administração</h2>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white uppercase italic leading-none">
          CONTROLE <span className="text-verdinha">GERENCIAL</span>
        </h1>
        <p className="text-white/30 font-medium text-lg border-l border-verdinha/20 pl-6">
          Gestão integral de recursos do servidor, regras e Marketplace através de uma interface administrativa unificada.
        </p>
      </div>

      <div className="flex bg-glass border border-white/5 p-2 rounded-2xl w-fit overflow-x-auto max-w-full">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setIsEditing(null); setFormData({}); }}
            className={cn(
              "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap",
              activeTab === tab.id ? "bg-white text-black shadow-2xl" : "text-white/20 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-minimal">
        {activeTab === 'settings' ? (
          <div className="lg:col-span-full bg-glass border border-white/5 p-12 rounded-[3rem] space-y-12">
            <div className="space-y-3">
              <h3 className="text-3xl font-black text-white italic uppercase tracking-tight">Identidade Visual</h3>
              <p className="text-white/30 font-medium">Configure os elementos básicos da interface global.</p>
            </div>
            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h4 className="text-xl font-bold text-white uppercase italic">Aparência</h4>
                <AdminInput 
                  label="URL do Logo Oficial" 
                  value={settingsData.logoUrl} 
                  onChange={v => setSettingsData({...settingsData, logoUrl: v})} 
                />
                <AdminInput 
                  label="Wallpaper de Fundo" 
                  value={settingsData.backgroundUrl} 
                  onChange={v => setSettingsData({...settingsData, backgroundUrl: v})} 
                />
              </div>

              <div className="space-y-6">
                <h4 className="text-xl font-bold text-white uppercase italic">FiveM Connectivity</h4>
                <AdminInput 
                  label="ID CFX (Ex: v8r4jz)" 
                  placeholder="ID da cfx.re"
                  value={settingsData.fivemCfxId || ''} 
                  onChange={v => setSettingsData({...settingsData, fivemCfxId: v})} 
                />
                <AdminInput 
                  label="IP Direto (Opcional)" 
                  placeholder="0.0.0.0:30120"
                  value={settingsData.serverIp || ''} 
                  onChange={v => setSettingsData({...settingsData, serverIp: v})} 
                />
              </div>

              <div className="space-y-6 md:col-span-2">
                <h4 className="text-sm font-black text-verdinha uppercase tracking-widest">Previews</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-10 bg-black/40 rounded-[2rem] border border-white/5 flex items-center justify-center min-h-[200px]">
                    {settingsData.logoUrl ? (
                      <img src={settingsData.logoUrl} alt="Preview Logo" className="max-h-24 object-contain grayscale-[50%] hover:grayscale-0 transition-all duration-700" />
                    ) : (
                      <p className="text-white/10 text-[10px] font-black uppercase tracking-widest">No Logo Data</p>
                    )}
                  </div>
                  <div className="p-4 bg-black/40 rounded-[2rem] border border-white/5 relative aspect-video overflow-hidden">
                    {settingsData.backgroundUrl ? (
                      <img src={settingsData.backgroundUrl} alt="Preview BG" className="w-full h-full object-cover rounded-2xl opacity-60" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-white/10 text-[10px] font-black uppercase tracking-widest">No Background Data</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 pt-8 border-t border-white/5">
                <button 
                  type="submit"
                  className="px-16 py-5 bg-white text-black font-black italic rounded-2xl hover:bg-verdinha transition-all duration-500 shadow-2xl uppercase text-sm"
                >
                  Confirmar Alterações
                </button>
              </div>
            </form>
          </div>
        ) : activeTab === 'users' ? (
          <div className="lg:col-span-full space-y-8">
            <div className="bg-glass border border-white/5 p-10 rounded-[3rem] flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tight">Gestão de Cidadãos</h3>
                <p className="text-white/30 text-sm font-medium">Buscando por {items.length} moradores registrados.</p>
              </div>
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="Pesquisar por Nome ou ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-2xl px-8 py-5 w-full md:w-80 text-white focus:outline-none focus:border-verdinha transition-all placeholder:text-white/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {filteredUsers.map(u => (
                <div key={u.id} className="bg-glass border border-white/5 p-10 rounded-[3rem] flex flex-col xl:flex-row xl:items-start justify-between gap-8 group hover:border-white/10 transition-all duration-700">
                  <div className="flex items-start gap-8 flex-1">
                    <div className="relative shrink-0">
                      <div className="absolute -inset-2 bg-verdinha/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-full" />
                      <img src={u.avatarUrl || 'https://via.placeholder.com/150'} className="w-24 h-24 rounded-[2.5rem] object-cover bg-white/5 relative z-10" />
                    </div>
                    <div className="flex-1 space-y-6">
                       <div className="flex flex-wrap items-center gap-4">
                          <div className="relative group/id">
                            <input 
                              type="number"
                              defaultValue={u.accountId}
                              onBlur={(e) => {
                                if (Number(e.target.value) !== u.accountId) handleUpdateUserBasic(u.id, 'accountId', Number(e.target.value));
                              }}
                              className="bg-verdinha/10 border border-verdinha/20 text-verdinha font-black uppercase tracking-widest px-3 py-1 rounded w-20 text-center text-[10px] focus:outline-none focus:border-verdinha transition-all"
                            />
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-black text-verdinha/40 uppercase tracking-widest opacity-0 group-hover/id:opacity-100 transition-opacity">Editar ID</span>
                          </div>
                          <div className="relative flex-1 min-w-[200px] group/name">
                            <input 
                              type="text"
                              defaultValue={u.displayName}
                              onBlur={(e) => {
                                if (e.target.value !== u.displayName) handleUpdateUserBasic(u.id, 'displayName', e.target.value);
                              }}
                              className="bg-transparent border-b border-white/5 text-3xl font-black text-white uppercase italic tracking-tighter w-full focus:outline-none focus:border-verdinha transition-all"
                            />
                            <span className="absolute -top-6 left-0 text-[8px] font-black text-white/20 uppercase tracking-widest opacity-0 group-hover/name:opacity-100 transition-opacity">Editar Nome</span>
                          </div>
                       </div>

                       <div className="flex flex-wrap gap-2">
                          {staffRoles.map(role => (
                             <button
                               key={role.id}
                               onClick={() => handleUpdateUserBasic(u.id, 'role', role.id)}
                               className={cn(
                                 "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                 u.role === role.id 
                                   ? role.color + " ring-1 ring-white/20" 
                                   : "bg-white/5 text-white/20 hover:bg-white/10 hover:text-white"
                               )}
                             >
                               {role.label}
                             </button>
                          ))}
                       </div>

                       <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-white/5">
                         <div className="flex items-center gap-3">
                           <Coins size={14} className="text-white/40" />
                           <p className="text-white/40 text-xs font-mono font-black">R$ {(u.coins || 0).toLocaleString()} <span className="opacity-40 font-sans font-medium uppercase tracking-widest ml-1">Moedas</span></p>
                         </div>
                         <div className="flex items-center gap-3">
                           <Diamond size={14} className="text-verdinha" />
                           <p className="text-white/40 text-xs font-mono font-black">{u.diamonds || 0} <span className="opacity-40 font-sans font-medium uppercase tracking-widest ml-1 uppercase">Diamonds</span></p>
                         </div>
                       </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
                    {/* Controles de Moedas */}
                    <div className="flex flex-col gap-2">
                      <CurrencyControl 
                        label="Add Moedas"
                        placeholder="R$ 0,00"
                        onConfirm={(val) => handleUpdateCurrency(u.id, 'coins', val)}
                        secondary
                      />
                    </div>
                    {/* Controles de Diamantes */}
                    <div className="flex flex-col gap-2">
                      <CurrencyControl 
                        label="Add Diamantes"
                        placeholder="0000"
                        onConfirm={(val) => handleUpdateCurrency(u.id, 'diamonds', val)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Editor Form */}
            <div className="lg:col-span-1 bg-glass border border-white/5 p-10 rounded-[3rem] h-fit sticky top-32 space-y-8">
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">{isEditing ? 'Editar' : 'Criar'} Registro</h3>
              <form onSubmit={handleSave} className="space-y-6">
            {activeTab === 'store' && (
              <>
                <AdminInput label="Nome do Produto" value={formData.name || ''} onChange={v => setFormData({...formData, name: v})} />
                <AdminInput label="Valor em Diamantes" type="number" value={formData.price || ''} onChange={v => setFormData({...formData, price: Number(v)})} />
                <AdminSelect label="Categoria" value={formData.category || 'cars'} options={[{id: 'cars', label: 'Veículos'}, {id: 'real_estate', label: 'Imóveis'}, {id: 'plans', label: 'Planos'}]} onChange={v => setFormData({...formData, category: v})} />
                <AdminInput label="Link da Imagem" value={formData.imageUrl || ''} onChange={v => setFormData({...formData, imageUrl: v})} />
                <AdminTextarea label="Descrição Detalhada" value={formData.description || ''} onChange={v => setFormData({...formData, description: v})} />
              </>
            )}
            {activeTab === 'orgs' && (
              <>
                <AdminInput label="Nome da Organização" value={formData.name || ''} onChange={v => setFormData({...formData, name: v})} />
                <AdminSelect label="Segmento" value={formData.type || 'police'} options={[{id: 'police', label: 'Corporação'}, {id: 'illegal', label: 'Facção'}, {id: 'group', label: 'Grupo Social'}]} onChange={v => setFormData({...formData, type: v})} />
                <AdminSelect label="Status de Recrutamento" value={formData.status || 'open'} options={[{id: 'open', label: 'Aberto'}, {id: 'closed', label: 'Fechado'}]} onChange={v => setFormData({...formData, status: v})} />
                <AdminInput label="Link do Escudo/Logo" value={formData.imageUrl || ''} onChange={v => setFormData({...formData, imageUrl: v})} />
                <AdminTextarea label="Pré-requisitos" placeholder="Liste o que é necessário para entrar..." value={formData.requirements || ''} onChange={v => setFormData({...formData, requirements: v})} />
                <AdminTextarea label="Manifesto • Biografia" value={formData.description || ''} onChange={v => setFormData({...formData, description: v})} />
              </>
            )}
            {activeTab === 'faqs' && (
              <>
                <AdminInput label="Categoria" placeholder="Ex: Comandos, Empregos..." value={formData.category || ''} onChange={v => setFormData({...formData, category: v})} />
                <AdminTextarea label="Questão Objetiva" value={formData.question || ''} onChange={v => setFormData({...formData, question: v})} />
                <AdminTextarea label="Resposta Instrutiva" value={formData.answer || ''} onChange={v => setFormData({...formData, answer: v})} />
              </>
            )}
            {activeTab === 'rules' && (
              <>
                <AdminInput label="Seção do Regulamento" value={formData.category || ''} onChange={v => setFormData({...formData, category: v})} />
                <AdminInput label="Código/Título da Regra" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} />
                <AdminTextarea label="Texto Normativo" value={formData.content || ''} onChange={v => setFormData({...formData, content: v})} />
              </>
            )}
            {activeTab === 'whitelist' && (
              <>
                <AdminInput label="Título do Material" value={formData.title || ''} onChange={v => setFormData({...formData, title: v})} />
                <AdminTextarea label="Conteúdo Didático" value={formData.content || ''} onChange={v => setFormData({...formData, content: v})} />
              </>
            )}

            <div className="flex gap-4 pt-4">
              {isEditing && (
                <button 
                  type="button" 
                  onClick={() => { setIsEditing(null); setFormData({}); }}
                  className="flex-1 py-4 text-white/40 font-black hover:text-white transition-all uppercase text-[10px] tracking-widest"
                >
                  Descartar
                </button>
              )}
              <button 
                type="submit"
                className="flex-[2] py-5 bg-white text-black font-black italic rounded-2xl hover:bg-verdinha transition-all duration-500 shadow-xl uppercase text-xs"
              >
                {isEditing ? 'Atualizar Dados' : 'Criar Novo'}
              </button>
            </div>
          </form>
        </div>

        {/* Items List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {items.length === 0 ? (
              <div className="py-20 text-center bg-white/[0.02] border border-dashed border-white/5 rounded-[2.5rem]">
                <p className="text-white/10 text-[10px] font-black uppercase tracking-[0.4em]">Nenhum item nesta categoria</p>
              </div>
            ) : (
              items.map(item => (
                <div key={item.id} className="bg-glass border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between group hover:border-white/10 transition-all duration-500">
                  <div className="flex items-center gap-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-verdinha/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-16 h-16 rounded-[1.25rem] object-cover bg-white/5 relative z-10" />
                      ) : (
                        <div className="w-16 h-16 rounded-[1.25rem] bg-white/5 flex items-center justify-center text-white/10 relative z-10">
                          <Edit size={20} />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-verdinha font-black uppercase tracking-[0.2em] mb-1">{item.category || item.type || 'Geral'}</p>
                      <h4 className="text-xl font-black text-white uppercase italic leading-none">{item.name || item.title || item.question}</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => { setIsEditing(item); setFormData(item); }}
                      className="p-4 bg-white/5 hover:bg-white text-white/20 hover:text-black rounded-2xl transition-all duration-500"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-4 bg-white/5 hover:bg-red-500 text-white/20 hover:text-white rounded-2xl transition-all duration-500"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </>
    )}
  </div>
</div>
);
}

function CurrencyControl({ label, placeholder, onConfirm, secondary = false }: { label: string; placeholder: string; onConfirm: (val: number) => void; secondary?: boolean }) {
  const [value, setValue] = useState('');
  
  return (
    <div className="flex flex-col gap-2 relative">
      <div className="relative group/input">
        <input 
          type="number" 
          placeholder={placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          className={cn(
            "bg-white/5 border border-white/10 rounded-2xl px-6 py-4 w-40 text-center text-white focus:outline-none transition-all placeholder:text-white/10",
            secondary ? "focus:border-white/40" : "focus:border-verdinha"
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm(Number(value));
              setValue('');
            }
          }}
        />
        <span className="absolute -top-3 left-1/2 -track-x-1/2 px-2 bg-[#0a0a0a] text-[8px] font-black text-white/20 uppercase tracking-widest whitespace-nowrap -translate-x-1/2">
          {label}
        </span>
      </div>
      <button 
        onClick={() => {
          onConfirm(Number(value));
          setValue('');
        }}
        className={cn(
          "w-full py-3 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] transition-all duration-500",
          secondary 
            ? "bg-white/10 text-white hover:bg-white hover:text-black" 
            : "bg-verdinha/10 text-verdinha hover:bg-verdinha hover:text-black"
        )}
      >
        ADICIONAR
      </button>
    </div>
  );
}

function AdminInput({ label, type = 'text', placeholder, value, onChange }: { label: string; type?: string; placeholder?: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-verdinha font-black uppercase tracking-[0.2em] ml-1">{label}</label>
      <input 
        type={type} 
        value={value} 
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-verdinha transition-all placeholder:text-white/10"
      />
    </div>
  );
}

function AdminTextarea({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-verdinha font-black uppercase tracking-[0.2em] ml-1">{label}</label>
      <textarea 
        value={value} 
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        rows={4}
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-verdinha transition-all resize-none placeholder:text-white/10"
      />
    </div>
  );
}

function AdminSelect({ label, value, options, onChange }: { label: string; value: any; options: any[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-verdinha font-black uppercase tracking-[0.2em] ml-1">{label}</label>
      <div className="relative">
        <select 
          value={value} 
          onChange={e => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-verdinha transition-all appearance-none cursor-pointer"
        >
          {options.map(o => (
            <option key={typeof o === 'string' ? o : o.id} value={typeof o === 'string' ? o : o.id} className="bg-[#0f0f0f]">
              {typeof o === 'string' ? o : o.label}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
          <ChevronDown size={14} />
        </div>
      </div>
    </div>
  );
}
