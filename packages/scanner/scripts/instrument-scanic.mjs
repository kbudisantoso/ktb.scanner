/** Scanic 1.7.1 computes per-pass buffers but omits them from its public debug result. */
export function instrumentScanic(source) {
  const replacements = [
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
    '// Local adaptation: optional document selection callback and opt-in diagnostic buffers.\n' +
    source
  );
}
