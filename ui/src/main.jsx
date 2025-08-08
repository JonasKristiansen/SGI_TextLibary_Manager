import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, Button, Title, BusyIndicator, Input } from '@ui5/webcomponents-react'
// Ensure UI5 themes & typography are loaded
import '@ui5/webcomponents/dist/Assets.js'
import '@ui5/webcomponents-fiori/dist/Assets.js'
// UI5 Table components - following documentation example
import '@ui5/webcomponents/dist/Table.js'
import '@ui5/webcomponents/dist/TableHeaderRow.js'
import '@ui5/webcomponents/dist/TableHeaderCell.js'
import '@ui5/webcomponents/dist/TableRow.js'
import '@ui5/webcomponents/dist/TableCell.js'
import '@ui5/webcomponents/dist/Label.js'
import '@ui5/webcomponents/dist/BusyIndicator.js'

function App(){
  const [value, setValue] = React.useState('')
  const [sim, setSim] = React.useState([])
  const [out, setOut] = React.useState('No results yet.')
  const [busySim, setBusySim] = React.useState(false)
  const [busyOut, setBusyOut] = React.useState(false)
  const [judgments, setJudgments] = React.useState([])
  const [hasChecked, setHasChecked] = React.useState(false)

  // Ensure IDs in judgments are displayed with the exact zero-padding used in the library list
  const formatIdFromSim = React.useCallback((judgedId)=>{
    const match = sim.find(s => Number(s.id) === Number(judgedId))
    return match ? String(match.id) : String(judgedId)
  }, [sim])

  async function run(){
    const text = value.trim()
    if(!text) return
    setHasChecked(true)
    setSim([])
    setOut('')
    setJudgments([])
    setBusySim(true)
    setBusyOut(true)
    try{
      const r = await fetch('/api/similar', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query:text, limit:100})})
      if(r.ok){
        const list = (await r.json())
        setSim(list)
        const lines = list.map((x,i)=> `${i+1}. [${x.id}] ${x.text}`).join('\n')
        const instruction = list.length ? `SYSTEM: You are a matching engine. Do NOT answer the user intent. Only evaluate matches from the provided candidates.\n\nUser intent:\n${text}\n\nCandidates (with IDs):\n${lines}\n\nReturn ONLY a numbered list of the top 25 best matches in this exact format:\n1. [<ID>] <text> — short reason\n2. [<ID>] <text> — short reason\n...\n25. [<ID>] <text> — short reason\n\nIf fewer than 25 good matches exist, return only the good ones. If none are good, return exactly: No exact match.` : text
        await callModel(instruction)
        return
      }
    } finally {
      setBusySim(false)
    }

    async function callModel(instruction){
      try{
        const res = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message: instruction})})
        if(res.ok){
          const payload = await res.json()
          let o = ''
          if(payload?.content?.length && payload.content[0].text){ o = payload.content[0].text }
          else if(payload?.choices?.length){ const m = payload.choices[0].message || payload.choices[0].delta; o = m?.content || JSON.stringify(payload) }
          else { o = JSON.stringify(payload) }
          // Parse tidy judgments like: "1. [2] Text — reason"
          const items = []
          o.split(/\n+/).forEach(line=>{
            const m = line.match(/^\s*\d+\.\s*\[(\d+)\]\s*(.*?)\s*[—-]\s*(.*)\s*$/)
            if(m){ items.push({ id: Number(m[1]), text: m[2].trim(), reason: m[3].trim() }) }
          })
          if(items.length){
            setJudgments(items)
            setOut('')
          } else {
            setJudgments([])
            setOut(o)
          }
        } else {
          setOut(`Error ${res.status}: ${await res.text()}`)
        }
      } finally {
        setBusyOut(false)
      }
    }
  }

  return (
    <ThemeProvider>
      <div style={{padding:'16px 16px', width:'100%', margin:'0', boxSizing:'border-box', backgroundColor:'#F5F6F7', minHeight:'100vh'}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:8, marginBottom:16}}>
          <Input value={value} onInput={(e)=>setValue(e.target.value)} placeholder="Enter text, e.g., Use damp cloth" style={{width:'100%'}}/>
          <Button design="Emphasized" onClick={run} style={{width:'100%', backgroundColor:'#0070F2', color:'white'}}>Check</Button>
        </div>
        {/* Evaluation table at the top */}
        {hasChecked && (
          <div style={{minWidth:0, marginTop:16, backgroundColor:'#FFFFFF', padding:'16px', borderRadius:'8px', boxShadow:'0 1px 4px rgba(117, 140, 164, 0.15)'}}>
            <Title level="H5" style={{margin:'0 0 10px 0', fontWeight:600, color:'#131E29'}}>Best Matches</Title>
            {busyOut ? (
              <ui5-busy-indicator active={busyOut} size="M" text="Evaluating with SAP AI Core..." style={{display:'block', width:'100%', minHeight:'100px'}} />
            ) : (
              <>
                {judgments.length ? (
                  <ui5-table style={{width:'100%', backgroundColor:'#FFFFFF', tableLayout:'fixed'}} no-data-text="No results">
                    <ui5-table-header-row slot="headerRow">
                      <ui5-table-header-cell style={{width:'80px'}}>ID</ui5-table-header-cell>
                      <ui5-table-header-cell style={{width:'50%'}}>Text</ui5-table-header-cell>
                      <ui5-table-header-cell style={{width:'50%'}}>Match Reason</ui5-table-header-cell>
                    </ui5-table-header-row>
                    {judgments.map((j) => (
                      <ui5-table-row key={j.id}>
                        <ui5-table-cell>
                          <ui5-label style={{color:'#556B82', fontWeight:'600'}}>{formatIdFromSim(j.id)}</ui5-label>
                        </ui5-table-cell>
                        <ui5-table-cell style={{whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere', color:'#131E29'}}>
                          {j.text}
                        </ui5-table-cell>
                        <ui5-table-cell style={{whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere', color:'#556B82'}}>
                          {j.reason}
                        </ui5-table-cell>
                      </ui5-table-row>
                    ))}
                  </ui5-table>
                ) : out ? (
                  <div>{out}</div>
                ) : (
                  <div>No results yet.</div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(<App />)


