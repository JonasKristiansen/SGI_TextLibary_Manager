import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, Button, Title, BusyIndicator, Input } from '@ui5/webcomponents-react'
// Register web component for list items directly (React wrapper changed in v2)
import '@ui5/webcomponents/dist/ListItemStandard.js'

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
        {hasChecked && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16, marginTop:16, width:'100%'}}>
          <div style={{border:'1px solid #ddd', borderRadius:8, padding:12, minWidth:0}}>
            <Title level="H5" style={{margin:'0 0 10px 0', fontWeight:800, color:'#0a6ed1'}}>Similar candidates from Text Library</Title>
            <BusyIndicator active={busySim} size="Small">
              {sim.length ? (
                <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed'}}>
                  <colgroup>
                    <col style={{width:'110px'}} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e0e0e0'}}>ID</th>
                      <th style={{textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e0e0e0'}}>Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.map(s => (
                      <tr key={s.id}>
                        <td style={{verticalAlign:'top', padding:'8px', borderBottom:'1px solid #f0f0f0', fontWeight:600, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'}}>{String(s.id)}</td>
                        <td style={{verticalAlign:'top', padding:'8px', borderBottom:'1px solid #f0f0f0', whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>{s.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', margin:0}}>No candidates</pre>
              )}
            </BusyIndicator>
          </div>
          <div style={{border:'1px solid #ddd', borderRadius:8, padding:12, minWidth:0}}>
            <Title level="H5" style={{margin:'0 0 10px 0', fontWeight:800, color:'#0a6ed1'}}>Evaluation from SAP AI Core</Title>
            <BusyIndicator active={busyOut} size="Small">
              {judgments.length ? (
                <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed'}}>
                  <colgroup>
                    <col style={{width:'110px'}} />
                    <col style={{width:'55%'}} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e0e0e0'}}>ID</th>
                      <th style={{textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e0e0e0'}}>Text</th>
                      <th style={{textAlign:'left', padding:'6px 8px', borderBottom:'1px solid #e0e0e0'}}>LLM Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {judgments.map(j => (
                      <tr key={j.id}>
                        <td style={{verticalAlign:'top', padding:'8px', borderBottom:'1px solid #f0f0f0', fontWeight:600, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'}}>{formatIdFromSim(j.id)}</td>
                        <td style={{verticalAlign:'top', padding:'8px', borderBottom:'1px solid #f0f0f0', whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>{j.text}</td>
                        <td style={{verticalAlign:'top', padding:'8px', borderBottom:'1px solid #f0f0f0', color:'#5f6b7a', whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'}}>{j.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', margin:0}}>{out}</pre>
              )}
            </BusyIndicator>
          </div>
        </div>
        )}
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(<App />)


