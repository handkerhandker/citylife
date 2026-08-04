/* 真模型产出的规则侧统计：明喻次数、招牌起手式次数（按句型判，不靠词表） */
const fs=require('fs');
const path=require('path');
const P=process.argv[2] || path.resolve(process.env.VC_OUT || path.join(__dirname,'.work'),'real_gens.json');
const g=JSON.parse(fs.readFileSync(P,'utf8'));
const NAMES={a1:'顾云帆',a2:'沈小满',a3:'陆知秋',a4:'白一鸣'};
// 明喻：像…／…似的／…一样／如同／跟…似的
// 明喻只认带喻词的：像…／跟…似的／如同／仿佛…；裸「一样」多为「也一样＝同样」，不算
const SIMILE=/像(?!样)[^，。！？]{1,12}(一样|似的)?|跟[^，。！？]{1,12}(一样|似的)|[^，。！？]{1,12}似的|如同|仿佛[^，。！？]{1,12}(一般|似的)?/g;
// 招牌起手式（仅看开头一小句，按句型判）
const ZHAO={
  a1:/^(跑通|复现|上线|部署|提测|CR|bug|代码|编译|报错|接口|需求评审)/i,      // 程序员词起手
  a2:/^(欸?你(闻|听|看|瞧)(见|到|那|着)?)|^(你(闻|听|看|瞧)[^，。！？]{0,6}(没|吗|不))/,   // 感官招呼：拉人闻/听/看
  a3:/^[^，。！？]{0,6}?(\d|[一二三四五六七八九十百千两]{1,3})[^，。！？]{0,4}(点|个点|成|%|％|元|块|倍|概率|胜率|比例)/,  // 报数起手
  a4:/^(窗|檐|灯|月|风|雨|光|夜色|天色|云(?!帆)|旧[^，。！？]{1,3}|案头|桌上|廊)/,   // 云(?!帆)：排除人名「云帆」误判为景物起手   // 文气意象起手（景物/器物入题）
};
function head(t){ const m=String(t).split(/[，。！？；~～—]/)[0]; return m||''; }
console.log('真模型（Claude）四人各 6 次日记 —— 规则侧统计\n');
for(const id of ['a1','a2','a3','a4']){
  const arr=g[id];
  let zhao=0, sim=0, simRounds=[];
  const heads=[];
  arr.forEach((t,i)=>{
    const h=head(t);
    heads.push(h.slice(0,14));
    if(ZHAO[id].test(h)) zhao++;
    const m=String(t).match(SIMILE);
    if(m && m.length){ sim++; simRounds.push('R'+(i+1)+':'+m[0].slice(0,12)); }
  });
  let consec=false; for(let i=1;i<arr.length;i++){
    const a=arr[i].match(SIMILE), b=arr[i-1].match(SIMILE);
    if(a&&a.length&&b&&b.length) consec=true;
  }
  console.log('【'+NAMES[id]+'】招牌起手式 '+zhao+'/6（配额 ≤1）｜含明喻的轮次 '+sim+'/6（配额 ≤2）｜明喻连续两轮：'+(consec?'有':'无'));
  console.log('  各轮开头：'+heads.join(' ／ '));
  if(simRounds.length) console.log('  明喻命中：'+simRounds.join('、'));
  console.log('');
}
