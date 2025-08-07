import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, Button, Title, BusyIndicator, List, Input } from '@ui5/webcomponents-react'
// Register web component for list items directly (React wrapper changed in v2)
import '@ui5/webcomponents/dist/ListItemStandard.js'

function App(){
  const [value, setValue] = React.useState('')
  const [sim, setSim] = React.useState([])
  const [out, setOut] = React.useState('No results yet.')
  const [busySim, setBusySim] = React.useState(false)
  const [busyOut, setBusyOut] = React.useState(false)
  const [judgments, setJudgments] = React.useState([])

  async function run(){
    const text = value.trim()
    if(!text) return
    setSim([])
    setOut('Waiting for model…')
    setBusySim(true)
    setBusyOut(true)
    try{
      const r = await fetch('/api/similar', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query:text, limit:10})})
      if(r.ok){
        const list = (await r.json()).sort((a,b)=> Number(a.id) - Number(b.id))
        setSim(list)
        const lines = list.map((x,i)=> `${i+1}. [${x.id}] ${x.text}`).join('\n')
        const instruction = list.length ? `SYSTEM: You are a matching engine. Do NOT answer the user intent. Only evaluate matches from the provided candidates.\n\nUser intent:\n${text}\n\nCandidates (with IDs):\n${lines}\n\nReturn ONLY a numbered list 1-3 in this exact format:\n1. [<ID>] <text> — short reason\n2. [<ID>] <text> — short reason\n3. [<ID>] <text> — short reason\nIf none are good, return exactly: No exact match.` : text
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
            items.sort((a,b)=> a.id - b.id)
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
      <div style={{padding:'16px 16px', width:'100%', margin:'0', boxSizing:'border-box'}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:8}}>
          <Input value={value} onInput={(e)=>setValue(e.target.value)} placeholder="Enter text, e.g., Use damp cloth" style={{width:'100%'}}/>
          <Button design="Emphasized" onClick={run} style={{width:'100%'}}>Check</Button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16, marginTop:16, width:'100%'}}>
          <div style={{border:'1px solid #ddd', borderRadius:8, padding:12, minWidth:0}}>
            <Title level="H6">Similar candidates from Text Library</Title>
            <BusyIndicator active={busySim} size="Small">
              {sim.length ? (
                <div style={{display:'grid', gridTemplateColumns:'1fr', gap:8}}>
                  {sim.map(s => (
                    <div key={s.id} style={{border:'1px solid #e0e0e0', borderRadius:6, padding:8}}>
                      <div style={{fontWeight:600, lineHeight:1.4, whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>
                        [{s.id}] {s.text}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', margin:0}}>No candidates</pre>
              )}
            </BusyIndicator>
          </div>
          <div style={{border:'1px solid #ddd', borderRadius:8, padding:12, minWidth:0}}>
            <Title level="H6">Model judgment (top 3, sorted by ID)</Title>
            <BusyIndicator active={busyOut} size="Small">
              {judgments.length ? (
                <div style={{display:'grid', gridTemplateColumns:'1fr', gap:8}}>
                  {judgments.map(j => (
                    <div key={j.id} style={{border:'1px solid #e0e0e0', borderRadius:6, padding:8}}>
                      <div style={{fontWeight:600, lineHeight:1.4, whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>
                        [{j.id}] {j.text}
                      </div>
                      <div className="muted" style={{marginTop:4, whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>
                        {j.reason}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', margin:0}}>{out}</pre>
              )}
            </BusyIndicator>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(<App />)


