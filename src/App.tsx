import React, { useState } from 'react';
import SpellsTab from './components/SpellsTab';
import { SpellData } from './types';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('spells');

  const handleCastSpell = (spell: SpellData) => {
    console.log('Casting spell:', spell.name);
    // Add your spell casting logic here
  };

  return (
    <div className="App min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">DNDKeep</h1>
              <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                v2.17.0
              </span>
            </div>
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('spells')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeTab === 'spells'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Spells
              </button>
              <button
                onClick={() => setActiveTab('monsters')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeTab === 'monsters'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monsters
              </button>
              <button
                onClick={() => setActiveTab('characters')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  activeTab === 'characters'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Characters
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'spells' && (
          <SpellsTab onCastSpell={handleCastSpell} />
        )}
        {activeTab === 'monsters' && (
          <div className="text-center py-12 text-gray-500">
            Monsters tab - coming soon
          </div>
        )}
        {activeTab === 'characters' && (
          <div className="text-center py-12 text-gray-500">
            Characters tab - coming soon  
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
