/**
 * VisualDiagram.jsx
 * Canvas API (vanilla JS inside React)
 *
 * COLOR RULES:
 *   Gain:  floor(1%) = dark-green #00a03c → white at large positive
 *   Loss:  floor(1%) = bright-red #c81e1e → black at large negative  (-25% ≈ near black)
 *   Null / 0%: neutral dim-blue [60,60,120]  (visible but clearly "no data")
 *
 *   Integer-floor quantization: 1.1%–1.9% all map to same color as 1%.
 *   Michaelis-Menten softT keeps outliers from dominating the scale.
 */

import { useEffect, useRef, useState, useCallback } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────────────────────────────────────────
const GAIN_BASE = [0, 160, 60]      // dark green at near-zero gain
const LOSS_BASE = [200, 30, 30]     // bright red at near-zero loss

function softT(abs, anchor) { return abs / (abs + anchor) }

function colorRGB(val, anchor) {
  if (val == null) return [60, 60, 120]           // visible "N/A" neutral

  // integer-floor: 1.1%…1.9% → same slot as 1%
  const q = Math.floor(Math.abs(val))
  const t = softT(q, anchor)                      // 0 → 1  asymptotically

  if (val >= 0) {
    // dark-green → white
    return [
      Math.round(GAIN_BASE[0] + t * (255 - GAIN_BASE[0])),
      Math.round(GAIN_BASE[1] + t * (255 - GAIN_BASE[1])),
      Math.round(GAIN_BASE[2] + t * (255 - GAIN_BASE[2])),
    ]
  } else {
    // bright-red → black  (MORE negative = DARKER)
    return [
      Math.round(LOSS_BASE[0] * (1 - t)),
      Math.round(LOSS_BASE[1] * (1 - t)),
      Math.round(LOSS_BASE[2] * (1 - t)),
    ]
  }
}

// Color an arm using value in billions when yoy is unavailable
// Positive revenue = gain spectrum, negative net income = loss spectrum
function colorFromValue(valueB, anchor) {
  if (!valueB) return [60, 60, 120]
  return colorRGB(valueB > 0 ? Math.min(valueB * 2, anchor) : -Math.min(Math.abs(valueB), anchor), anchor)
}

// per-ring anchors (unchanged from original)
const revRGB   = y => colorRGB(y, 15)
const cfRGB    = y => colorRGB(y, 20)
const niRGB    = y => colorRGB(y, 30)
const dayRGB   = p => colorRGB(p,  2)
const weekRGB  = p => colorRGB(p,  5)
const monthRGB = p => colorRGB(p, 10)

const rs = (r,g,b,a=1) => `rgba(${r},${g},${b},${a})`

// ─────────────────────────────────────────────────────────────────────────────
// PCT SERIES
// ─────────────────────────────────────────────────────────────────────────────
function buildPcts(closes) {
  return Array.from({ length: 8 }, (_, i) => {
    const prev = closes[i], curr = closes[i+1]
    if (!prev || !curr) return 0
    return parseFloat(((curr - prev) / prev * 100).toFixed(2))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// OCTAGON GEOMETRY  — exact copy of original HTML
// ─────────────────────────────────────────────────────────────────────────────
function faceAngle(i) { return -Math.PI/2 - (7-i)*(Math.PI/4) }
function faceCentre(r, i, cx, cy) {
  const a = faceAngle(i)
  return [cx + r*Math.cos(a), cy + r*Math.sin(a)]
}
function octVerts(r, cx, cy) {
  return Array.from({ length: 8 }, (_, k) => {
    const a = faceAngle(k) - Math.PI/8
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HIT-TEST (tooltip)
// ─────────────────────────────────────────────────────────────────────────────
function ptInQuad(px, py, pts) {
  function sign(ax,ay,bx,by,cx,cy){ return (ax-cx)*(by-cy)-(bx-cx)*(ay-cy) }
  function inTri(p,a,b,c){
    const d1=sign(p[0],p[1],a[0],a[1],b[0],b[1])
    const d2=sign(p[0],p[1],b[0],b[1],c[0],c[1])
    const d3=sign(p[0],p[1],c[0],c[1],a[0],a[1])
    return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))
  }
  const p=[px,py]
  return inTri(p,pts[0],pts[1],pts[2]) || inTri(p,pts[0],pts[2],pts[3])
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW SQUARE RING  — exact port of original, with ctx as first arg
// Coordinates are RELATIVE to CX,CY (original style), added at draw time.
// arm 0=Q1(3:00)  arm 1=Q2(6:00)  arm 2=Q3(9:00)  arm 3=Q4(12:00)
// ─────────────────────────────────────────────────────────────────────────────
function drawSquareRing(ctx, data, outerH, innerH, label, colourFn, CX, CY) {
  const sides = [
    { arm:3, x0:-outerH,y0:-outerH, x1:+outerH,y1:-outerH, xi0:-innerH,yi0:-innerH, xi1:+innerH,yi1:-innerH },
    { arm:2, x0:-outerH,y0:+outerH, x1:-outerH,y1:-outerH, xi0:-innerH,yi0:+innerH, xi1:-innerH,yi1:-innerH },
    { arm:1, x0:+outerH,y0:+outerH, x1:-outerH,y1:+outerH, xi0:+innerH,yi0:+innerH, xi1:-innerH,yi1:+innerH },
    { arm:0, x0:+outerH,y0:-outerH, x1:+outerH,y1:+outerH, xi0:+innerH,yi0:-innerH, xi1:+innerH,yi1:+innerH },
  ]

  sides.forEach(s => {
    // use a safe fallback so arm always renders even with no data
    const d   = data[s.arm] || { yoy: null, value: 0, period: '', label: '' }
    const yov = (d.yoy != null && isFinite(d.yoy)) ? d.yoy : null
    // when yoy unavailable, color by value magnitude so arm stays visible
    const [r,g,b] = yov != null
      ? colourFn(yov)
      : colorFromValue((d.value || 0) / 1e9, 10)
    const dim = [Math.round(r*.22), Math.round(g*.22), Math.round(b*.22)]
    const mx  = (s.x0+s.x1+s.xi0+s.xi1)/4 + CX
    const my  = (s.y0+s.y1+s.yi0+s.yi1)/4 + CY
    const dx=mx-CX, dy=my-CY, dist=Math.sqrt(dx*dx+dy*dy)||1
    const nx=dx/dist, ny=dy/dist, half=(outerH-innerH)*.45
    const grd = ctx.createLinearGradient(mx-nx*half,my-ny*half, mx+nx*half,my+ny*half)
    grd.addColorStop(0,   rs(dim[0],dim[1],dim[2],.70))
    grd.addColorStop(.45, rs(r,g,b,1))
    grd.addColorStop(.55, rs(r,g,b,1))
    grd.addColorStop(1,   rs(dim[0],dim[1],dim[2],.70))
    ctx.beginPath()
    ctx.moveTo(CX+s.x0,CY+s.y0);  ctx.lineTo(CX+s.x1,CY+s.y1)
    ctx.lineTo(CX+s.xi1,CY+s.yi1); ctx.lineTo(CX+s.xi0,CY+s.yi0)
    ctx.closePath()
    ctx.fillStyle=grd; ctx.fill()
    ctx.strokeStyle='#03030c'; ctx.lineWidth=3; ctx.stroke()

    // text
    const th = outerH-innerH
    const br = (r*.299+g*.587+b*.114)/255
    const fg = br>.45?'#000':'#fff'
    ctx.save(); ctx.translate(mx,my)
    if (s.arm===3||s.arm===1) ctx.rotate(0); else ctx.rotate(Math.PI/2)
    ctx.textAlign='center'; ctx.textBaseline='middle'
    const lbl   = d.label || d.period || ''
    const yoyTx = yov!=null ? (yov>0?'+':'')+yov+'% YoY' : '— YoY N/A'
    if (th > 22) {
      ctx.font=`bold ${Math.min(11,th*.18)}px monospace`; ctx.fillStyle=fg
      ctx.fillText(lbl, 0, -th*.12)
      ctx.font=`${Math.min(9,th*.15)}px monospace`
      ctx.fillStyle=br>.45?'#0008':'#fff9'
      ctx.fillText(yoyTx, 0, th*.12)
    } else {
      ctx.font='bold 7px monospace'; ctx.fillStyle=fg
      ctx.fillText(yoyTx, 0, 0)
    }
    ctx.restore()
  })

  // corners — blend adjacent arm colors
  const corners = [
    { arms:[3,2], x:-outerH,y:-outerH, ix:-innerH,iy:-innerH },
    { arms:[2,1], x:-outerH,y:+outerH, ix:-innerH,iy:+innerH },
    { arms:[1,0], x:+outerH,y:+outerH, ix:+innerH,iy:+innerH },
    { arms:[0,3], x:+outerH,y:-outerH, ix:+innerH,iy:-innerH },
  ]
  corners.forEach(c => {
    const yov0 = (data[c.arms[0]]?.yoy != null && isFinite(data[c.arms[0]]?.yoy)) ? data[c.arms[0]].yoy : null
    const yov1 = (data[c.arms[1]]?.yoy != null && isFinite(data[c.arms[1]]?.yoy)) ? data[c.arms[1]].yoy : null
    const [r1,g1,b1]=colourFn(yov0), [r2,g2,b2]=colourFn(yov1)
    const bl=[(r1+r2)>>1,(g1+g2)>>1,(b1+b2)>>1]
    ctx.beginPath()
    ctx.moveTo(CX+c.x,CY+c.y);  ctx.lineTo(CX+c.ix,CY+c.y)
    ctx.lineTo(CX+c.ix,CY+c.iy); ctx.lineTo(CX+c.x,CY+c.iy)
    ctx.closePath()
    ctx.fillStyle=rs(bl[0],bl[1],bl[2],.85); ctx.fill()
    ctx.strokeStyle='#03030c'; ctx.lineWidth=2; ctx.stroke()
  })

  ctx.save(); ctx.font='bold 9px monospace'
  ctx.fillStyle='rgba(0,200,80,0.07)'; ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(label, CX, CY-(outerH+innerH)/2); ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW OCTAGON RING  — exact port of original
// ─────────────────────────────────────────────────────────────────────────────
function drawOctRing(ctx, oR, iR, pcts, thick, colourFn, cx, cy) {
  const ov=octVerts(oR,cx,cy), iv=octVerts(iR,cx,cy)
  for (let i=0;i<8;i++) {
    const ni=(i+1)%8
    const pct=pcts[i]
    const [r,g,b]=colourFn(pct)
    const o0=ov[i],o1=ov[ni],i0=iv[i],i1=iv[ni]
    const mx=(o0[0]+o1[0]+i0[0]+i1[0])/4
    const my=(o0[1]+o1[1]+i0[1]+i1[1])/4
    const dx=mx-cx,dy=my-cy,dist=Math.sqrt(dx*dx+dy*dy)||1
    const nx=dx/dist,ny=dy/dist,half=thick*.45
    const grd=ctx.createLinearGradient(mx-nx*half,my-ny*half, mx+nx*half,my+ny*half)
    const d=[Math.round(r*.28),Math.round(g*.28),Math.round(b*.28)]
    grd.addColorStop(0,  rs(d[0],d[1],d[2],.75))
    grd.addColorStop(.5, rs(r,g,b,1))
    grd.addColorStop(1,  rs(d[0],d[1],d[2],.75))
    ctx.beginPath()
    ctx.moveTo(o0[0],o0[1]); ctx.lineTo(o1[0],o1[1])
    ctx.lineTo(i1[0],i1[1]); ctx.lineTo(i0[0],i0[1])
    ctx.closePath(); ctx.fillStyle=grd; ctx.fill()
    ctx.strokeStyle='#03030c'; ctx.lineWidth=thick>30?2.5:1.8; ctx.stroke()

    if (Math.abs(pct)>=0.4&&thick>10) {
      const br=(r*.299+g*.587+b*.114)/255
      ctx.save(); ctx.translate(mx,my); ctx.rotate(faceAngle(i)+Math.PI/2)
      ctx.textAlign='center'; ctx.textBaseline='middle'
      const fs=Math.max(6,Math.min(12,thick*.30))
      ctx.font=`bold ${fs}px monospace`; ctx.fillStyle=br>.52?'#000':'#fff'
      ctx.fillText((pct>0?'+':'')+pct.toFixed(1)+'%',0,0); ctx.restore()
    }

    // corner spine
    const op=ov[i],ip=iv[i]
    const [rA,gA,bA]=colourFn(pcts[(i+7)%8])
    const [rB,gB,bB]=colourFn(pct)
    const bl=[(rA+rB)>>1,(gA+gB)>>1,(bA+bB)>>1]
    const ddx=ip[0]-op[0],ddy=ip[1]-op[1],dl=Math.sqrt(ddx*ddx+ddy*ddy)||1
    const cw=thick*.16, cnx=-ddy/dl*cw/2, cny=ddx/dl*cw/2
    const cg=ctx.createLinearGradient(op[0],op[1],ip[0],ip[1])
    const cd=bl.map(v=>Math.round(v*.28))
    cg.addColorStop(0,  rs(cd[0],cd[1],cd[2]))
    cg.addColorStop(.5, rs(bl[0],bl[1],bl[2]))
    cg.addColorStop(1,  rs(cd[0],cd[1],cd[2]))
    ctx.beginPath()
    ctx.moveTo(op[0]+cnx,op[1]+cny); ctx.lineTo(op[0]-cnx,op[1]-cny)
    ctx.lineTo(ip[0]-cnx,ip[1]-cny); ctx.lineTo(ip[0]+cnx,ip[1]+cny)
    ctx.closePath(); ctx.fillStyle=cg; ctx.fill()
    ctx.strokeStyle='#03030c'; ctx.lineWidth=1.2; ctx.stroke()
  }
  ;[ov,iv].forEach(v=>{
    ctx.beginPath(); v.forEach((p,k)=>k===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]))
    ctx.closePath(); ctx.strokeStyle='#070718'; ctx.lineWidth=.7; ctx.stroke()
  })
}

function drawCenter(ctx,gr,cx,cy,dP) {
  const iv=octVerts(gr,cx,cy)
  ctx.beginPath(); iv.forEach((p,k)=>k===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]))
  ctx.closePath(); ctx.fillStyle='#03030c'; ctx.fill()
  const [r,g,b]=dayRGB(dP[7])
  const gs=gr*.55
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.PI/4)
  ctx.fillStyle=rs(r,g,b,.9); ctx.fillRect(-gs,-gs,gs*2,gs*2); ctx.restore()
  ctx.save(); ctx.translate(cx,cy)
  ctx.fillStyle=rs(r,g,b,.45); ctx.fillRect(-gs*.6,-gs*.6,gs*1.2,gs*1.2); ctx.restore()
  ctx.beginPath(); ctx.arc(cx,cy,Math.max(2,gr*.22),0,Math.PI*2)
  ctx.fillStyle='#fff'; ctx.fill()
}

const CLKP=['12','10:30','9','7:30','6','4:30','3','1:30']
function drawOctTicks(ctx,r,cx,cy,fs) {
  for (let i=0;i<8;i++) {
    const [x,y]=faceCentre(r+fs*1.4,i,cx,cy)
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.font=`${fs}px monospace`; ctx.fillStyle='#1a1a35'
    ctx.fillText(CLKP[7-i],x,y); ctx.restore()
  }
}
function drawSqTicks(ctx,outerH,CX,CY) {
  [
    {x:CX+outerH+14,y:CY,         lbl:'3:00 (Q1)'},
    {x:CX,          y:CY+outerH+14,lbl:'6:00 (Q2)'},
    {x:CX-outerH-14,y:CY,         lbl:'9:00 (Q3)'},
    {x:CX,          y:CY-outerH-14,lbl:'12:00 (Q4)'},
  ].forEach(p=>{
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.font='8px monospace'; ctx.fillStyle='#1a1a40'
    ctx.fillText(p.lbl,p.x,p.y); ctx.restore()
  })
}
function drawMarker(ctx,r,cx,cy,sz) {
  ctx.save(); ctx.beginPath()
  ctx.moveTo(cx,cy-r); ctx.lineTo(cx-sz,cy-r+sz*2.2); ctx.lineTo(cx+sz,cy-r+sz*2.2)
  ctx.closePath(); ctx.fillStyle='#1e2a5a'; ctx.fill(); ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// HIT REGIONS
// ─────────────────────────────────────────────────────────────────────────────
function buildHitRegions(view,REV,CF,NI,dP,wP,mP,CX,CY,
                          OR,MR,IR,GR,SQ0,SQ1,SQ2,SQ3,techBig,eOR,eMR,eIR,eGR) {
  const regions=[]
  if (view!=='tech') {
    [
      {data:REV,oH:SQ3,iH:SQ2,name:'Revenue'},
      {data:CF, oH:SQ2,iH:SQ1,name:'Cash Flow'},
      {data:NI, oH:SQ1,iH:SQ0,name:'Net Profit'},
    ].forEach(({data,oH,iH,name})=>{
      const sides=[
        {arm:3,x0:-oH,y0:-oH,x1:+oH,y1:-oH,xi0:-iH,yi0:-iH,xi1:+iH,yi1:-iH},
        {arm:2,x0:-oH,y0:+oH,x1:-oH,y1:-oH,xi0:-iH,yi0:+iH,xi1:-iH,yi1:-iH},
        {arm:1,x0:+oH,y0:+oH,x1:-oH,y1:+oH,xi0:+iH,yi0:+iH,xi1:-iH,yi1:+iH},
        {arm:0,x0:+oH,y0:-oH,x1:+oH,y1:+oH,xi0:+iH,yi0:-iH,xi1:+iH,yi1:+iH},
      ]
      sides.forEach(s=>{
        const d=data[s.arm]||{yoy:null,value:0,period:'',label:''}
        const yov=(d.yoy!=null&&isFinite(d.yoy))?d.yoy:null
        regions.push({
          label:`${name} · ${d.period||''}`,
          line1:'$'+(Math.abs(d.value||0)/1e9).toFixed(2)+'B',
          line2:'YoY: '+(yov!=null?(yov>0?'+':'')+yov+'%':'N/A'),
          pts:[
            [CX+s.x0,CY+s.y0],[CX+s.x1,CY+s.y1],
            [CX+s.xi1,CY+s.yi1],[CX+s.xi0,CY+s.yi0],
          ],
        })
      })
    })
  }
  if (view!=='fund') {
    const oR=techBig?eOR:OR,mR=techBig?eMR:MR
    const iR=techBig?eIR:IR,gR=techBig?eGR:GR
    ;[
      {oR,     iR:mR, pcts:mP,name:'Monthly'},
      {oR:mR,  iR,    pcts:wP,name:'Weekly'},
      {oR:iR,  iR:gR, pcts:dP,name:'Daily'},
    ].forEach(({oR:ouR,iR:inR,pcts,name})=>{
      const ov=octVerts(ouR,CX,CY),iv=octVerts(inR,CX,CY)
      for (let i=0;i<8;i++){
        const ni=(i+1)%8, pct=pcts[i]
        regions.push({
          label:`${name} · ${CLKP[7-i]}`,
          line1:(pct>0?'+':'')+pct.toFixed(2)+'%',
          line2:'',
          pts:[ov[i],ov[ni],iv[ni],iv[i]],
        })
      }
    })
  }
  return regions
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DRAW
// ─────────────────────────────────────────────────────────────────────────────
function drawChart(canvas,view,REV,CF,NI,dP,wP,mP) {
  const ctx=canvas.getContext('2d')
  const W=620,CX=310,CY=310
  const GR=13,IR=28,MR=45,OR=67
  const SQ0=89,SQ1=115,SQ2=154,SQ3=212
  const OCT_S=SQ3/OR
  const eOR=Math.round(OR*OCT_S),eMR=Math.round(MR*OCT_S)
  const eIR=Math.round(IR*OCT_S),eGR=Math.round(GR*OCT_S)
  const eTO=eOR-eMR,eTM=eMR-eIR,eTI=eIR-eGR

  ctx.clearRect(0,0,W,W)
  ctx.fillStyle='#03030c'; ctx.fillRect(0,0,W,W)
  const bg=ctx.createRadialGradient(CX,CY,5,CX,CY,300)
  bg.addColorStop(0,'rgba(10,20,60,.4)'); bg.addColorStop(1,'rgba(0,0,0,0)')
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,W)

  const showFund=view==='both'||view==='fund'
  const showTech=view==='both'||view==='tech'
  const techBig =view==='tech'

  if (showFund) {
    drawSquareRing(ctx,REV,SQ3,SQ2,'REVENUE',   revRGB,CX,CY)
    drawSquareRing(ctx,CF, SQ2,SQ1,'CASH FLOW', cfRGB, CX,CY)
    drawSquareRing(ctx,NI, SQ1,SQ0,'NET PROFIT',niRGB, CX,CY)
    drawSqTicks(ctx,SQ3+2,CX,CY)
  }

  if (!techBig) {
    ctx.fillStyle='#03030c'
    ctx.fillRect(CX-SQ0,CY-SQ0,SQ0*2,SQ0*2)
    ctx.strokeStyle='#0a0a25'; ctx.lineWidth=1
    ctx.strokeRect(CX-SQ0,CY-SQ0,SQ0*2,SQ0*2)
  }

  if (showTech) {
    if (techBig) {
      ctx.fillStyle='#03030c'; ctx.fillRect(0,0,W,W)
      const bg2=ctx.createRadialGradient(CX,CY,10,CX,CY,eOR+20)
      bg2.addColorStop(0,'rgba(8,18,55,.55)'); bg2.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=bg2; ctx.fillRect(0,0,W,W)
      drawMarker(ctx,eOR+18,CX,CY,7)
      drawOctTicks(ctx,eOR+4,CX,CY,10)
      drawOctRing(ctx,eOR,eMR,mP,eTO,monthRGB,CX,CY)
      drawOctRing(ctx,eMR,eIR,wP,eTM,weekRGB, CX,CY)
      drawOctRing(ctx,eIR,eGR,dP,eTI,dayRGB,  CX,CY)
      drawCenter(ctx,eGR,CX,CY,dP)
      ;[{r:(eOR+eMR)/2,lbl:'MONTHLY  ·  8 periods'},
        {r:(eMR+eIR)/2,lbl:'WEEKLY  ·  8 periods'},
        {r:(eIR+eGR)/2,lbl:'DAILY  ·  8 periods'},
      ].forEach(rl=>{
        const [lx,ly]=faceCentre(rl.r,0,CX,CY)
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'
        ctx.font='bold 8px monospace'; ctx.fillStyle='rgba(180,220,255,0.13)'
        ctx.fillText(rl.lbl,lx,ly); ctx.restore()
      })
    } else {
      drawMarker(ctx,OR+10,CX,CY,4)
      drawOctTicks(ctx,OR+4,CX,CY,7)
      drawOctRing(ctx,OR,MR,mP,OR-MR,monthRGB,CX,CY)
      drawOctRing(ctx,MR,IR,wP,MR-IR,weekRGB, CX,CY)
      drawOctRing(ctx,IR,GR,dP,IR-GR,dayRGB,  CX,CY)
      drawCenter(ctx,GR,CX,CY,dP)
    }
  } else {
    const iv=octVerts(OR,CX,CY)
    ctx.beginPath(); iv.forEach((p,k)=>k===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]))
    ctx.closePath(); ctx.fillStyle='#050510'; ctx.fill()
    ctx.strokeStyle='#0c0c22'; ctx.lineWidth=1; ctx.stroke()
    ctx.beginPath(); ctx.arc(CX,CY,4,0,Math.PI*2)
    ctx.fillStyle='#1a1a40'; ctx.fill()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PILLS
// ─────────────────────────────────────────────────────────────────────────────
function Pill({value,colourFn,isYoy=true,label}) {
  const [r,g,b]=colourFn(value??null)
  const br=(r*.299+g*.587+b*.114)/255
  const text=isYoy
    ?(value!=null?(value>0?'+':'')+value+'%':'N/A')
    :(value!=null?(value>0?'+':'')+Number(value).toFixed(1)+'%':'N/A')
  return (
    <span title={label} style={{
      fontSize:8,fontWeight:700,padding:'2px 6px',borderRadius:3,
      background:`rgb(${r},${g},${b})`,color:br>.45?'#000':'#fff',cursor:'default',
    }}>{text}</span>
  )
}
function PillGroup({label,items,colourFn,isYoy}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'center'}}>
      <div style={{fontSize:8,color:'#2a2a45',letterSpacing:'.05em'}}>{label}</div>
      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
        {items.map((item,i)=>(
          <Pill key={i} value={isYoy?(item?.yoy??null):item}
            label={item?.label||''} colourFn={colourFn} isYoy={isYoy}/>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLUME BAR
// ─────────────────────────────────────────────────────────────────────────────
function VolumeBar({rows}) {
  if (!rows?.length) return null
  const maxVol=Math.max(...rows.map(r=>r.total||r.volume||0))||1
  return (
    <div style={{background:'#07071a',borderRadius:8,padding:'12px 14px',marginTop:10}}>
      <div style={{display:'flex',gap:4,alignItems:'flex-end',height:60}}>
        {rows.map((row,i)=>{
          const total=row.total??row.volume??0
          const buy=row.buy_volume??0,sell=row.sell_volume??0
          const buyH=total?(buy/maxVol*52):0, sellH=total?(sell/maxVol*52):0
          return (
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:1}}
              title={`${row.date}\nBuy: ${(buy/1e6).toFixed(1)}M\nSell: ${(sell/1e6).toFixed(1)}M\nTotal: ${(total/1e6).toFixed(1)}M`}>
              <div style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                <div style={{width:'70%',height:Math.max(1,buyH),background:'rgba(0,192,80,0.7)',borderRadius:'2px 2px 0 0'}}/>
                <div style={{width:'70%',height:Math.max(1,sellH),background:'rgba(200,30,30,0.7)',borderRadius:'0 0 2px 2px'}}/>
              </div>
              <div style={{fontSize:7,color:'#1a1a40',marginTop:2,fontFamily:'monospace'}}>{(row.date||'').slice(5)}</div>
            </div>
          )
        })}
      </div>
      <div style={{display:'flex',gap:12,marginTop:6}}>
        <span style={{fontSize:8,color:'rgba(0,192,80,0.7)',fontFamily:'monospace'}}>▮ Buy pressure</span>
        <span style={{fontSize:8,color:'rgba(200,30,30,0.7)',fontFamily:'monospace'}}>▮ Sell pressure</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function VisualDiagram({chartData,loading,error}) {
  const canvasRef=useRef(null)
  const [view,setView]=useState('both')
  const [volTab,setVolTab]=useState('daily')
  const [tooltip,setTooltip]=useState(null)
  const hitRef=useRef([])

  // safe yoy: pass through as-is; null handled by colorRGB
  const toQuarters = arr => (arr||[]).map(q=>({
    value:  q.value  ?? 0,
    yoy:    (q.yoy != null && isFinite(q.yoy)) ? q.yoy : null,
    period: q.period ?? '',
    label:  q.label  ?? q.period ?? '',
  }))

  const getDerived=useCallback(()=>{
    if (!chartData) return null
    const {daily,weekly,monthly,revenue,net_income,cash_flow}=chartData
    return {
      dP: buildPcts((daily  ||[]).map(r=>r.close)),
      wP: buildPcts((weekly ||[]).map(r=>r.close)),
      mP: buildPcts((monthly||[]).map(r=>r.close)),
      REV: toQuarters(revenue),
      CF:  toQuarters(cash_flow),
      NI:  toQuarters(net_income),
    }
  },[chartData])

  useEffect(()=>{
    if (!chartData||!canvasRef.current) return
    const d=getDerived(); if (!d) return
    const {dP,wP,mP,REV,CF,NI}=d

    // debug: log what we're passing to the canvas
    console.log('[VisualDiagram] REV:', REV)
    console.log('[VisualDiagram] CF:',  CF)
    console.log('[VisualDiagram] NI:',  NI)

    drawChart(canvasRef.current,view,REV,CF,NI,dP,wP,mP)

    const CX=310,CY=310,GR=13,IR=28,MR=45,OR=67
    const SQ0=89,SQ1=115,SQ2=154,SQ3=212,s=SQ3/OR
    hitRef.current=buildHitRegions(
      view,REV,CF,NI,dP,wP,mP,CX,CY,OR,MR,IR,GR,SQ0,SQ1,SQ2,SQ3,
      view==='tech',
      Math.round(OR*s),Math.round(MR*s),Math.round(IR*s),Math.round(GR*s)
    )
  },[chartData,view,getDerived])

  const handleMouseMove=useCallback((e)=>{
    const canvas=canvasRef.current; if (!canvas) return
    const rect=canvas.getBoundingClientRect()
    const cx=(e.clientX-rect.left)*(620/rect.width)
    const cy=(e.clientY-rect.top) *(620/rect.height)
    const hit=hitRef.current.find(r=>ptInQuad(cx,cy,r.pts))
    setTooltip(hit?{label:hit.label,line1:hit.line1,line2:hit.line2,
      cx:e.clientX-rect.left,cy:e.clientY-rect.top}:null)
  },[])

  const handleMouseLeave=useCallback(()=>setTooltip(null),[])

  if (loading) return <div style={shell}><div style={{color:'#3a5aaa',fontFamily:'monospace',fontSize:13}}>Loading chart data…</div></div>
  if (error)   return <div style={shell}><div style={{color:'#cc3300',fontFamily:'monospace',fontSize:12}}>{error}</div></div>
  if (!chartData) return null

  const {symbol,current_price,change_pct,daily,weekly,monthly,revenue,net_income,cash_flow}=chartData
  const isUp=(change_pct??0)>=0
  const volRows=volTab==='daily'?daily:volTab==='weekly'?weekly:monthly
  const d=getDerived()||{}

  return (
    <div style={shell}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
        <div style={{fontSize:20,fontWeight:700,letterSpacing:'.12em',color:'#c8d8ff',fontFamily:'monospace'}}>{symbol}</div>
        {current_price&&(
          <div style={{fontSize:22,fontWeight:500,color:'#e8f0ff',fontFamily:'monospace'}}>
            ${Number(current_price).toFixed(2)}
            <span style={{fontSize:12,fontWeight:600,padding:'2px 9px',borderRadius:4,marginLeft:8,
              background:isUp?'#0a2218':'#1a0606',color:isUp?'#2ecc71':'#e74c3c'}}>
              {isUp?'+':''}{Number(change_pct||0).toFixed(2)}%
            </span>
          </div>
        )}
        <div style={{fontSize:9,color:'#1c1c38',fontFamily:'monospace'}}>Fundamentals + Price Rings · Canvas API (vanilla JS)</div>
      </div>

      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
        {[['both','Fundamental + Technical'],['fund','Fundamental'],['tech','Technical']].map(([v,lbl])=>(
          <button key={v} onClick={()=>setView(v)} style={{
            fontFamily:'monospace',fontSize:10,fontWeight:700,letterSpacing:'.08em',
            padding:'5px 14px',borderRadius:5,cursor:'pointer',textTransform:'uppercase',
            border:`1px solid ${view===v?'#4a7aff':'#1a2a60'}`,
            background:view===v?'#0e1a48':'#070718',color:view===v?'#c8d8ff':'#3a5aaa',
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{position:'relative',width:'100%',maxWidth:620}}>
        <canvas ref={canvasRef} width={620} height={620}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
          style={{maxWidth:'100%',borderRadius:8,display:'block',cursor:'crosshair'}}/>
        {tooltip&&(
          <div style={{
            position:'absolute',left:tooltip.cx+14,top:Math.max(0,tooltip.cy-10),
            background:'#0a0e1f',border:'1px solid #2a3a6a',borderRadius:6,
            padding:'7px 11px',pointerEvents:'none',zIndex:9999,
            fontFamily:'monospace',minWidth:130,boxShadow:'0 4px 16px rgba(0,0,80,0.5)',
          }}>
            <div style={{fontSize:10,fontWeight:700,color:'#8ab0ff',marginBottom:3}}>{tooltip.label}</div>
            <div style={{fontSize:13,fontWeight:700,color:'#e8f0ff'}}>{tooltip.line1}</div>
            {tooltip.line2&&<div style={{fontSize:10,color:'#6080c0',marginTop:2}}>{tooltip.line2}</div>}
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:18,flexWrap:'wrap',justifyContent:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:9,color:'#2a2a50',fontFamily:'monospace'}}>
          <div style={{width:36,height:9,borderRadius:2,background:'linear-gradient(90deg,#00a03c,#ffffff)'}}/>
          green → white (gain)
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:9,color:'#2a2a50',fontFamily:'monospace'}}>
          <div style={{width:36,height:9,borderRadius:2,background:'linear-gradient(90deg,#c81e1e,#000000)'}}/>
          red → black (loss, bigger = darker)
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5,fontSize:9,color:'#2a2a50',fontFamily:'monospace'}}>
          <div style={{width:14,height:9,borderRadius:2,background:'#3c3c78'}}/>
          N/A
        </div>
      </div>

      {view!=='tech'&&revenue?.length>0&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
          <PillGroup label="Revenue"    items={d.REV||[]} colourFn={revRGB} isYoy/>
          <PillGroup label="Cash Flow"  items={d.CF ||[]} colourFn={cfRGB}  isYoy/>
          <PillGroup label="Net Profit" items={d.NI ||[]} colourFn={niRGB}  isYoy/>
        </div>
      )}
      {view!=='fund'&&daily?.length>0&&(
        <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
          <PillGroup label="Daily (8d)"   items={buildPcts((daily  ||[]).map(r=>r.close))} colourFn={dayRGB}   isYoy={false}/>
          <PillGroup label="Weekly (8w)"  items={buildPcts((weekly ||[]).map(r=>r.close))} colourFn={weekRGB}  isYoy={false}/>
          <PillGroup label="Monthly (8m)" items={buildPcts((monthly||[]).map(r=>r.close))} colourFn={monthRGB} isYoy={false}/>
        </div>
      )}

      {view!=='tech'&&<div style={{fontSize:9,color:'#111128',textAlign:'center',fontFamily:'monospace'}}>
        Squares: outer=Revenue · mid=Cash Flow · inner=Net Profit&nbsp;&nbsp;(12→9→6→3 o'clock = Q4→Q3→Q2→Q1)
      </div>}
      {view!=='fund'&&<div style={{fontSize:9,color:'#111128',textAlign:'center',fontFamily:'monospace'}}>
        Octagons: outer=8 months · mid=8 weeks · inner=8 days · hover for exact values
      </div>}

      <div style={{width:'100%',maxWidth:620}}>
        <div style={{fontSize:10,color:'#3a5aaa',fontWeight:700,fontFamily:'monospace',letterSpacing:'.08em',marginBottom:6}}>VOLUME ANALYSIS</div>
        <div style={{display:'flex',gap:6,marginBottom:4}}>
          {[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,lbl])=>(
            <button key={v} onClick={()=>setVolTab(v)} style={{
              fontFamily:'monospace',fontSize:9,fontWeight:700,padding:'3px 10px',borderRadius:4,cursor:'pointer',
              border:`1px solid ${volTab===v?'#4a7aff':'#1a2a60'}`,
              background:volTab===v?'#0e1a48':'#070718',color:volTab===v?'#c8d8ff':'#3a5aaa',
            }}>{lbl}</button>
          ))}
        </div>
        <VolumeBar rows={volRows}/>
      </div>
    </div>
  )
}

const shell={
  display:'flex',flexDirection:'column',alignItems:'center',gap:14,
  padding:'22px 12px',background:'#03030c',borderRadius:16,
  fontFamily:'monospace',width:'100%',
}
