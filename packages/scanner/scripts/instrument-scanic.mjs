/** Scanic 1.7.1 computes per-pass buffers but omits them from its public debug result. */
export function instrumentScanic(source) {
  const replacements = [
    [
      'a=O(t,o),s=a.getContext("2d"),r=[[g.x,g.y],[B.x,B.y],[Q.x,Q.y],[C.x,C.y]];return{canvas:a,imageData:uA(s,A,wA(r,[[0,0],[t-1,0],[t-1,o-1],[0,o-1]]),t,o,r)}}',
      'a=O(t,o);try{const s=a.getContext("2d"),r=[[g.x,g.y],[B.x,B.y],[Q.x,Q.y],[C.x,C.y]];return{canvas:a,imageData:uA(s,A,wA(r,[[0,0],[t-1,0],[t-1,o-1],[0,o-1]]),t,o,r)}}catch(error){a.width=a.height=1;throw error}}',
    ],
    [
      'try{const{canvas:g,imageData:Q}=dA(A,I);return{output:await z(g,Q,B),corners:I,success:!0,message:"Document extracted successfully"}}catch(Q){return{output:null,corners:I,success:!1,message:`Extraction failed: ${Q.message}`}}}',
      'let extractionCanvas,completed=!1;try{const{canvas:g,imageData:Q}=dA(A,I);extractionCanvas=g;const output=await z(g,Q,B);completed=!0;return{output,corners:I,success:!0,message:"Document extracted successfully"}}catch(Q){return{output:null,corners:I,success:!1,message:`Extraction failed: ${Q.message}`}}finally{if(extractionCanvas&&(B==="imagedata"||!completed))extractionCanvas.width=extractionCanvas.height=1}}',
    ],
    [
      'const h=r.corners,l=r.contour;let y=h;',
      'typeof Q.selectCandidate==="function"&&C&&!C._timingsOnly&&(C.selectedCandidate=Object.fromEntries(Object.keys(C.selectedCandidate||{}).map(A=>[A,r[A]])),C.selectedCandidate.corners=r.corners);const h=r.corners,l=r.contour;let y=h;',
    ],
    [
      's.sort(rA);const r=s[0]||null,c=s;',
      's.sort(rA);const c=s,r=typeof Q.selectCandidate==="function"?Q.selectCandidate(s,{width:I,height:g})||null:s[0]||null;',
    ],
    [
      'contours:c,best:h,candidates:l}',
      'contours:c,best:h,candidates:l,...(Q.debug?{diagnostic:{buffers:a,edges:s}}:{})}',
    ],
    [
      'if(t.push(a),yA(a.best,Q))',
      'if(t.push(a),Q.debug&&(C.diagnosticInput={grayscale:A,width:I,height:g},C.diagnosticPasses=[{name:a.name,...a.diagnostic}]),yA(a.best,Q))',
    ],
    [
      'if(t.push(A),!yA(A.best,Q))',
      'if(t.push(A),Q.debug&&C.diagnosticPasses.push({name:A.name,...A.diagnostic}),!yA(A.best,Q))',
    ],
  ];
  for (const [needle, replacement] of replacements) {
    if (source.split(needle).length !== 2)
      throw new Error(
        'Scanic 1.7.1 diagnostic instrumentation no longer matches. Review upstream before building.',
      );
    source = source.replace(needle, replacement);
  }
  return (
    '// Local adaptation: document selection, diagnostic buffers and extraction-canvas cleanup.\n' +
    source
  );
}
