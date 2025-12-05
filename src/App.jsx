import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, Users, Wallet, Save, ArrowRight, Loader2 } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, 
  query, orderBy, serverTimestamp, getDoc, setDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- Firebase Configuration & Initialization ---

// 1. 環境変数からの設定（このプレビュー環境用）
const envConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;

// 2. 手動設定（Vercelやローカル環境用）
// ※ここにあなたのFirebase設定を入力してください
const manualConfig = {
  apiKey: "AIzaSyDFgV-oI9ay5xlaozVGBpmuW1HBwwpJ7Xk",
  authDomain: "hakuba-plan.firebaseapp.com",
  projectId: "hakuba-plan",
  storageBucket: "hakuba-plan.firebasestorage.app",
  messagingSenderId: "383462260844",
  appId: "1:383462260844:web:6a42f90cc9f2501a891849",
  measurementId: "G-4FKW0LKLTV"
};

// 自動判定: 環境変数があればそれを使い、なければ手動設定を使う
const firebaseConfig = envConfig || manualConfig;

// アプリID設定
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'hakuba-trip-2026';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TravelBudgetManager = () => {
  // --- State Management ---
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState([]); // [{id: '...', name: '...'}]
  const [newMemberName, setNewMemberName] = useState('');
  
  const [expenses, setExpenses] = useState([]);
  const [activeTab, setActiveTab] = useState('input');
  const [loading, setLoading] = useState(true);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Members & Expenses
  useEffect(() => {
    if (!user) return;

    // RULE 1: Strict Paths
    const membersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'members');
    const expensesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses');

    // RULE 2: No Complex Queries (simple collection fetch, sort in memory)
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort manually since we avoid orderBy in query
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMembers(data);
    }, (error) => console.error("Members fetch error:", error));

    const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setExpenses(data);
      setLoading(false);
    }, (error) => console.error("Expenses fetch error:", error));

    return () => {
      unsubMembers();
      unsubExpenses();
    };
  }, [user]);

  // --- Actions (Write to DB) ---
  const addMember = async () => {
    if (!newMemberName.trim()) return;
    if (members.some(m => m.name === newMemberName)) return;

    try {
      const membersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'members');
      await addDoc(membersRef, {
        name: newMemberName,
        createdAt: serverTimestamp()
      });
      setNewMemberName('');
    } catch (e) {
      console.error("Error adding member:", e);
    }
  };

  const removeMember = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'members', id));
    } catch (e) {
      console.error("Error removing member:", e);
    }
  };

  const addExpense = async () => {
    try {
      const expensesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses');
      await addDoc(expensesRef, {
        item: '新規項目',
        category: 'その他',
        budget: 0,
        actual: 0,
        payer: '各自', // Default
        splitType: 'split',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error adding expense:", e);
    }
  };

  const updateExpense = async (id, field, value) => {
    // Optimistic UI update could be added here, but Firestore is fast enough usually
    try {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id);
      await updateDoc(ref, { [field]: value });
    } catch (e) {
      console.error("Error updating expense:", e);
    }
  };

  const removeExpense = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id));
    } catch (e) {
      console.error("Error deleting expense:", e);
    }
  };

  // --- Calculations ---
  const totalBudget = expenses.reduce((sum, e) => sum + Number(e.budget || 0), 0);
  const totalActual = expenses.reduce((sum, e) => sum + Number(e.actual || 0), 0);
  
  const calculateSettlements = () => {
    const memberNames = members.map(m => m.name);
    if (memberNames.length === 0) return { totalSharedCost: 0, perPersonShare: 0, transactions: [] };

    const balances = {};
    memberNames.forEach(m => balances[m] = 0);

    let totalSharedCost = 0;

    expenses.forEach(e => {
      const cost = Number(e.actual || 0);
      
      if (e.splitType === 'split') {
        totalSharedCost += cost;
        // Credit the payer (Check if payer still exists in members list)
        if (memberNames.includes(e.payer)) {
          balances[e.payer] += cost;
        }
      }
    });

    const perPersonShare = totalSharedCost / memberNames.length;

    memberNames.forEach(m => {
      balances[m] -= perPersonShare;
    });

    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([name, amount]) => {
      const roundedAmount = Math.round(amount);
      if (roundedAmount < -1) debtors.push({ name, amount: roundedAmount });
      if (roundedAmount > 1) creditors.push({ name, amount: roundedAmount });
    });

    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    let i = 0; 
    let j = 0; 

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const amountToPay = Math.min(Math.abs(debtor.amount), creditor.amount);
      
      if (amountToPay > 0) {
        transactions.push({ from: debtor.name, to: creditor.name, amount: amountToPay });
      }

      debtor.amount += amountToPay;
      creditor.amount -= amountToPay;

      if (Math.abs(debtor.amount) < 1) i++;
      if (creditor.amount < 1) j++;
    }

    return { totalSharedCost, perPersonShare, transactions };
  };

  const { totalSharedCost, perPersonShare, transactions } = calculateSettlements();

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 bg-gray-50 min-h-screen font-sans text-gray-800">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        
        {/* Header */}
        <div className="bg-blue-600 p-6 text-white">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-8 h-8" />
            白馬旅行 予算＆精算シート
          </h1>
          <p className="text-blue-100 mt-2 text-sm">クラウド同期版: 編集内容は全員に共有されます</p>
          
          <div className="flex gap-4 mt-6">
            <div className="bg-blue-700/50 p-3 rounded-lg flex-1 text-center">
              <p className="text-xs uppercase tracking-wider text-blue-200">予算合計</p>
              <p className="text-2xl font-bold">¥{totalBudget.toLocaleString()}</p>
            </div>
            <div className={`p-3 rounded-lg flex-1 text-center ${totalActual > totalBudget ? 'bg-red-500/80' : 'bg-green-500/50'}`}>
              <p className="text-xs uppercase tracking-wider text-white/90">実績合計</p>
              <p className="text-2xl font-bold">¥{totalActual.toLocaleString()}</p>
            </div>
            <div className="bg-blue-700/50 p-3 rounded-lg flex-1 text-center">
              <p className="text-xs uppercase tracking-wider text-blue-200">1人あたり</p>
              <p className="text-2xl font-bold">¥{Math.round(perPersonShare).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'input' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            1. 入力・編集
          </button>
          <button 
            onClick={() => setActiveTab('report')}
            className={`flex-1 py-4 text-center font-medium ${activeTab === 'report' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            2. 精算レポート
          </button>
        </div>

        {/* Content: Input Tab */}
        {activeTab === 'input' && (
          <div className="p-6">
            
            {/* Members Section */}
            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" /> 参加メンバー
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {members.length === 0 && <span className="text-gray-400 text-sm">メンバーを追加してください</span>}
                {members.map(member => (
                  <span key={member.id} className="px-3 py-1 bg-white border border-gray-300 rounded-full text-sm flex items-center gap-2">
                    {member.name}
                    <button onClick={() => removeMember(member.id)} className="text-gray-400 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newMemberName} 
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="メンバー名を追加"
                  className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                />
                <button onClick={addMember} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">追加</button>
              </div>
            </div>

            {/* Expenses Table */}
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" /> 支出リスト
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 uppercase">
                  <tr>
                    <th className="p-3 w-1/3">項目名</th>
                    <th className="p-3 w-20">予算</th>
                    <th className="p-3 w-20">実績</th>
                    <th className="p-3 w-24">支払者</th>
                    <th className="p-3 w-24">区分</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={expense.item} 
                          onChange={(e) => updateExpense(expense.id, 'item', e.target.value)}
                          className="w-full bg-transparent p-1 border-b border-transparent focus:border-blue-300 outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          value={expense.budget} 
                          onChange={(e) => updateExpense(expense.id, 'budget', Number(e.target.value))}
                          className="w-full bg-transparent p-1 text-right focus:bg-white border border-transparent focus:border-gray-300 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number" 
                          value={expense.actual} 
                          onChange={(e) => updateExpense(expense.id, 'actual', Number(e.target.value))}
                          className={`w-full bg-transparent p-1 text-right font-bold focus:bg-white border border-transparent focus:border-gray-300 rounded ${(expense.actual || 0) > (expense.budget || 0) ? 'text-red-600' : 'text-gray-800'}`}
                        />
                      </td>
                      <td className="p-2">
                        <select 
                          value={expense.payer} 
                          onChange={(e) => updateExpense(expense.id, 'payer', e.target.value)}
                          className="w-full bg-transparent p-1 rounded focus:bg-white border border-transparent focus:border-gray-300"
                        >
                          <option value="各自">各自</option>
                          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select 
                          value={expense.splitType} 
                          onChange={(e) => updateExpense(expense.id, 'splitType', e.target.value)}
                          className="w-full bg-transparent p-1 rounded focus:bg-white border border-transparent focus:border-gray-300 text-xs"
                        >
                          <option value="split">割勘対象</option>
                          <option value="individual">個人支払</option>
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeExpense(expense.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <button onClick={addExpense} className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm">
              <Plus className="w-4 h-4" /> 行を追加
            </button>
          </div>
        )}

        {/* Content: Report Tab */}
        {activeTab === 'report' && (
          <div className="p-8">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-bold mb-2">精算レポート</h2>
              <p className="text-gray-500 text-sm">以下の通り精算を行ってください</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Summary Card */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">内訳サマリー</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">割勘対象の支払総額</span>
                    <span className="font-bold">¥{totalSharedCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">人数</span>
                    <span>{members.length} 名</span>
                  </div>
                  <div className="flex justify-between text-lg text-blue-600 font-bold border-t pt-2 mt-2">
                    <span>1人あたり負担額</span>
                    <span>¥{Math.round(perPersonShare).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Transactions Card */}
              <div className="bg-white p-6 rounded-xl border-2 border-blue-100 shadow-sm">
                <h3 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                  <Wallet className="w-5 h-5" /> 送金リスト
                </h3>
                
                {transactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>精算の必要はありません</p>
                    {members.length === 0 && <p className="text-xs mt-2">※メンバーを追加してください</p>}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-700">{t.from}</span>
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-700">{t.to}</span>
                        </div>
                        <div className="font-bold text-blue-600 text-lg">
                          ¥{t.amount.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TravelBudgetManager;
