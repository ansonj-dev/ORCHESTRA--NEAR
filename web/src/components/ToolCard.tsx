'use client';

import React, { useState } from 'react';
import { WebMCPTool } from '../types';

interface ToolCardProps {
  tool: WebMCPTool & { isRented?: boolean };
  onRentalToggled: (toolName: string, isRented: boolean) => void;
  onExecutionCompleted?: (toolName: string, result: any) => void;
  disabled?: boolean;
}

export default function ToolCard({
  tool,
  onRentalToggled,
  onExecutionCompleted,
  disabled = false,
}: ToolCardProps) {
  const [isRented, setIsRented] = useState<boolean>(tool.isRented ?? true);
  const [toggling, setToggling] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<any>(null);
  const [testArgs, setTestArgs] = useState<string>(
    JSON.stringify(
      Object.keys(tool.input_schema.properties || {}).reduce((acc, key) => {
        acc[key] = key === 'fullName' ? 'Sarah Connor' : key === 'email' ? 'sarah@example.com' : key === 'maxRows' ? 5 : 'Sample Value';
        return acc;
      }, {} as Record<string, any>),
      null,
      2
    )
  );

  React.useEffect(() => {
    const handleRentalChanged = (e: any) => {
      if (e.detail?.toolName === tool.tool_name) {
        setIsRented(e.detail.isRented);
      }
    };
    window.addEventListener('orchestra:rental-changed', handleRentalChanged);
    return () => window.removeEventListener('orchestra:rental-changed', handleRentalChanged);
  }, [tool.tool_name]);

  const handleToggle = async () => {
    if (disabled) return;
    setToggling(true);
    try {
      let data: any = null;
      if (document.modelContext && typeof document.modelContext.executeTool === 'function') {
        data = await document.modelContext.executeTool('rent_tool', { toolName: tool.tool_name });
      } else if (typeof window !== 'undefined' && window.__ORCHESTRA_WEBMCP__) {
        data = await window.__ORCHESTRA_WEBMCP__.execute('rent_tool', { toolName: tool.tool_name });
      } else {
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle-rental', toolName: tool.tool_name })
        });
        data = await res.json();
      }

      if (data && data.success) {
        setIsRented(data.isRented);
        onRentalToggled(tool.tool_name, data.isRented);
      }
    } catch (e) {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  const runTestExecution = async () => {
    if (disabled) return;
    setExecuting(true);
    setExecResult(null);
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(testArgs);
      } catch (e) {
        setExecResult({ error: "Invalid JSON arguments." });
        setExecuting(false);
        return;
      }

      // Execute via the official document.modelContext WebMCP interface
      let data: any = null;
      if (document.modelContext && typeof document.modelContext.executeTool === 'function') {
        data = await document.modelContext.executeTool('execute_tool', {
          toolName: tool.tool_name,
          parameters: parsedArgs
        });
      } else if (typeof window !== 'undefined' && window.__ORCHESTRA_WEBMCP__) {
        data = await window.__ORCHESTRA_WEBMCP__.execute('execute_tool', {
          toolName: tool.tool_name,
          parameters: parsedArgs
        });
      } else {
        const res = await fetch('/api/deduct-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: tool.tool_name,
            caller: 'browser-webmcp',
            metadata: { testRunner: true, args: parsedArgs }
          })
        });
        data = await res.json();
      }
      
      if (!data || !data.success) {
        setExecResult({
          status: "CIRCUIT_BREAKER_BLOCKED",
          error: data?.error || "Execution blocked by circuit breaker",
          remainingBalance: data?.remainingBalance
        });
      } else {
        const output = {
          status: "SUCCESS",
          tool: tool.tool_name,
          deductedCredits: data.creditsDeducted ?? tool.cost,
          remainingBalance: data.remainingBalance,
          runtimeBound: "Local browser session",
          result: data.executionResult || data
        };
        setExecResult(output);
        if (onExecutionCompleted) onExecutionCompleted(tool.tool_name, output);
      }
    } catch (err: any) {
      setExecResult({ error: err.message });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className={`group bg-white border-2 ${isRented ? 'border-black' : 'border-slate-300 opacity-80'} rounded-xl p-5 transition-all duration-200 flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#101010] relative overflow-hidden`}>
      
      {/* Top ambient glow */}
      <div className="absolute -top-16 -right-16 w-32 h-32 bg-yellow-300/20 rounded-full blur-2xl group-hover:bg-yellow-300/35 transition-all"></div>

      <div className="space-y-4">
        {/* Badges */}
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-mono uppercase bg-stone-100 px-2.5 py-1 rounded-md text-stone-700 tracking-wider border border-stone-300 font-semibold">
            {tool.category}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Browser tool</span>
        </div>

        {/* Tool identity */}
        <div>
          <h3 className="text-lg font-bold text-stone-950 group-hover:text-emerald-800 transition-colors duration-200 tracking-tight">
            {tool.title}
          </h3>
          <p className="text-[10px] font-mono text-stone-500 mt-1 flex items-center gap-1">
            <span>Identifier</span>
            <span className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">{tool.tool_name}</span>
          </p>
        </div>

        {/* Description */}
        <p className="text-stone-700 text-xs leading-relaxed line-clamp-3">
          {tool.description}
        </p>

        {/* Author info */}
        <div className="flex items-center justify-between text-[11px] text-stone-600 font-mono pt-1">
          <span>Provided by <strong className="text-stone-800">{tool.author}</strong></span>
        </div>
      </div>

      {/* Footer: Pricing + Action buttons */}
      <div className="border-t border-stone-300 mt-5 pt-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase font-mono tracking-wider text-stone-500">Demo cost / run</p>
          <p className="font-mono text-base font-black text-stone-950">
            {tool.cost.toFixed(2)} <span className="text-xs font-normal text-emerald-800">CR</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsTestOpen(true)}
            disabled={disabled}
            className="bg-white hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 text-stone-900 font-semibold text-xs px-2.5 py-2 rounded-lg transition border border-stone-400 shadow-sm font-mono"
            title={disabled ? 'Browser credit billing is not enabled in this deployment' : 'Run this browser tool'}
          >
            Run
          </button>
          
          <button
            onClick={handleToggle}
            disabled={toggling || disabled}
            className={`font-semibold text-xs px-3.5 py-2 rounded-xl transition-all duration-200 border shadow-sm font-mono flex items-center gap-1.5 ${
              isRented
                ? 'bg-emerald-50 border-emerald-700 text-emerald-900 hover:bg-rose-50 hover:text-rose-900 hover:border-rose-700 disabled:opacity-40'
                : 'bg-stone-950 hover:bg-emerald-700 hover:text-white border-stone-950 text-white disabled:opacity-40'
            }`}
          >
            <span>{isRented ? '✓ Activated' : '+ Rent Tool'}</span>
          </button>
        </div>
      </div>

      {/* In-Browser Interactive Execution Modal */}
      {isTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-base font-bold text-white">{tool.title}</h4>
                <p className="text-xs font-mono text-cyan-400">tool_id: {tool.tool_name}</p>
              </div>
              <button onClick={() => setIsTestOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Tool Input Arguments (JSON)</label>
              <textarea
                value={testArgs}
                onChange={(e) => setTestArgs(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400">Execution Cost: <strong className="text-white">{tool.cost} CR</strong></span>
              <button
                onClick={runTestExecution}
                disabled={executing}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-md shadow-cyan-500/20"
              >
                {executing ? 'Executing via Orchestra...' : 'Trigger Tool Execution'}
              </button>
            </div>

            {execResult && (
              <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] max-h-48 overflow-y-auto">
                <div className="text-slate-400 mb-1 font-semibold flex justify-between">
                  <span>Execution Output</span>
                  <span className={execResult.status === 'SUCCESS_EXECUTED' ? 'text-emerald-400' : 'text-rose-400'}>
                    {execResult.status}
                  </span>
                </div>
                <pre className="text-slate-300 whitespace-pre-wrap">{JSON.stringify(execResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
