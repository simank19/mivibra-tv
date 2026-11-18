// Anime Motion Studio — personajes base 3D originales para MiVibra TV.
// Geometría procedural ligera, orientada al frente (+Z), con rig humano compatible
// con los nombres normalizados que ya consume el sistema de movimiento.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshToonMaterial({
  color, flatShading: true, ...extra
});
const sphere = (parent, name, color, pos, scale, material = null) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material || mat(color));
  mesh.name = name; mesh.position.set(...pos); mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
const capsule = (parent, name, color, radius, length, pos, rotation = [0,0,0]) => {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat(color));
  mesh.name = name; mesh.position.set(...pos); mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
const bone = (name, parent, position) => {
  const b = new THREE.Bone(); b.name = name; b.position.set(...position); parent.add(b); return b;
};
const sign = side => side === 'L' ? 1 : -1;
const normMap = {
  hips:'Hips', spine:'Abdomen', chest:'Torso', upperChest:'Chest', neck:'Neck', head:'Head',
  leftShoulder:'ShoulderL', rightShoulder:'ShoulderR',
  leftUpperArm:'UpperArmL', rightUpperArm:'UpperArmR',
  leftLowerArm:'LowerArmL', rightLowerArm:'LowerArmR',
  leftHand:'HandL', rightHand:'HandR',
  leftUpperLeg:'UpperLegL', rightUpperLeg:'UpperLegR',
  leftLowerLeg:'LowerLegL', rightLowerLeg:'LowerLegR',
  leftFoot:'FootL', rightFoot:'FootR'
};
function makeHair(head, color, feminine) {
  const group = new THREE.Group(); group.name = 'AnimeHair'; head.add(group);
  sphere(group, 'HairCap', color, [0,.31,-.015], [.49,.42,.43]);
  // Flequillo en mechones separados: silueta legible incluso a distancia de TV.
  for (let i=0;i<5;i++) {
    const x = (i-2)*.145;
    const bang = sphere(group, 'Bangs'+i, color, [x,.12,.345], [.14,.28,.13]);
    bang.rotation.z = (i-2)*-.12;
  }
  if (feminine) {
    sphere(group,'HairBack',color,[0,-.28,-.12],[.43,.62,.31]);
    for (const s of [-1,1]) {
      const lock = capsule(group,'LongLock',color,.105,.72,[s*.37,-.35,.0],[0,0,s*.08]);
      lock.scale.set(1,1,.9);
    }
    sphere(group,'Ponytail',color,[.02,.12,-.43],[.2,.48,.2]).rotation.x=-.3;
  } else {
    sphere(group,'SideHairL',color,[.42,-.03,.03],[.16,.28,.2]);
    sphere(group,'SideHairR',color,[-.42,-.03,.03],[.16,.28,.2]);
    for (let i=0;i<4;i++) {
      const spike=sphere(group,'Spike'+i,color,[(i-1.5)*.18,.48,.03],[.12,.25,.12]);
      spike.rotation.z=(i-1.5)*-.28;
    }
  }
  return group;
}
function makeFace(head, recipe, skin, hair) {
  const eyeColor = recipe.eyes || '#3a2416';
  const face = new THREE.Group(); face.name='AnimeFace'; head.add(face);
  const eyeGroups=[];
  for (const side of [-1,1]) {
    const eye = new THREE.Group(); eye.position.set(side*.205,.015,.405); eye.name='EyeGroup'; face.add(eye);
    sphere(eye,'Sclera','#fff',[0,0,0],[.155,.205,.065]);
    sphere(eye,'Iris',eyeColor,[0,-.005,.056],[.091,.135,.025]);
    sphere(eye,'Pupil','#100d12',[0,-.005,.078],[.047,.09,.018]);
    sphere(eye,'EyeHighlight','#fff',[-.033,.052,.096],[.035,.045,.012]);
    sphere(eye,'EyeHighlightSmall','#fff',[.045,-.045,.094],[.016,.02,.009]);
    const lash=capsule(eye,'UpperLash','#21151a',.018,.25,[0,.178,.045],[0,0,Math.PI/2]);
    lash.scale.set(1,.9,1);
    sphere(face,'Brow',hair,[side*.205,.245,.395],[.16,.035,.035]).rotation.z=side*-.08;
    eyeGroups.push(eye);
  }
  // nariz discreta con luz y sombra, y boca geométrica intercambiable.
  sphere(face,'Nose',skin,[0,-.105,.435],[.045,.065,.045]);
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.105,-.225,.425), new THREE.Vector3(0,-.265,.445), new THREE.Vector3(.105,-.225,.425)
  ]);
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(smileCurve,12,.014,6,false),mat('#7e3340'));
  mouth.name='Mouth'; face.add(mouth);
  sphere(face,'CheekL','#e99b91',[-.27,-.13,.34],[.075,.035,.018],mat('#e99b91',{transparent:true,opacity:.48}));
  sphere(face,'CheekR','#e99b91',[.27,-.13,.34],[.075,.035,.018],mat('#e99b91',{transparent:true,opacity:.48}));
  return { group:face, eyes:eyeGroups, mouth };
}
function addFingerBones(hand, side, bones) {
  const s=sign(side), names=['Index','Middle','Ring','Little'];
  names.forEach((name,i)=>{
    const x=s*(.045+(i-1.5)*.045);
    const a=bone(name+(side==='L'?2:2)+side,hand,[x,-.025,.015]); bones[a.name]=a;
    const b=bone(name+(side==='L'?3:3)+side,a,[0,-.035,0]); bones[b.name]=b;
    const c=bone(name+(side==='L'?4:4)+side,b,[0,-.03,0]); bones[c.name]=c;
  });
  const t1=bone('Thumb2'+side,hand,[s*.1,0,.005]); bones[t1.name]=t1;
  const t2=bone('Thumb3'+side,t1,[s*.035,-.035,.01]); bones[t2.name]=t2;
}
function createCharacter(recipe, opts) {
  const female = recipe.g === 'f';
  const skin = recipe.skin || (female?'#d9a074':'#c58b62');
  const hairColor = recipe.hair || '#24162a';
  const top = recipe.top || '#ff7048', topDetail=recipe.top2||'#f4f5f6';
  const bottom=recipe.bottom||'#253047', shoes=recipe.shoes||'#f4f5f6';
  const root = new THREE.Group(); root.name=female?'AnimeFemale':'AnimeMale';
  const bones={};
  const hips=bone('Hips',root,[0,.91,0]); bones.Hips=hips;
  const abdomen=bone('Abdomen',hips,[0,.12,0]); bones.Abdomen=abdomen;
  const torso=bone('Torso',abdomen,[0,.16,0]); bones.Torso=torso;
  const chest=bone('Chest',torso,[0,.13,0]); bones.Chest=chest;
  const neck=bone('Neck',chest,[0,.16,0]); bones.Neck=neck;
  const head=bone('Head',neck,[0,.12,0]); bones.Head=head;
  // Tronco en capas: cuello, torso y prenda superior.
  capsule(root,'NeckSkin',skin,.105,.13,[0,1.49,0]);
  const torsoMesh=capsule(root,'BodyBase',skin,female?.205:.23,.39,[0,1.19,0]);
  torsoMesh.scale.x=female?.94:1.06;
  const shirt=capsule(root,'TopGarment',top,female?.218:.245,.37,[0,1.205,.018]);
  shirt.scale.x=female?.96:1.08;
  sphere(root,'Collar',topDetail,[0,1.405,.04],[.12,.055,.12]);
  // Cadera y piernas con proporción videojuego anime.
  sphere(root,'Pelvis',bottom,[0,.91,0],[female?.25:.27,.19,.16]);
  for (const side of ['L','R']) {
    const s=sign(side), x=s*(female?.135:.145);
    const upper=bone('UpperLeg'+side,hips,[x,-.08,0]); bones[upper.name]=upper;
    capsule(upper,'Thigh',bottom,.115,.27,[0,-.17,0]);
    const knee=bone('LowerLeg'+side,upper,[0,-.34,0]); bones[knee.name]=knee;
    sphere(knee,'Knee',skin,[0,-.015,.012],[.105,.09,.105]);
    capsule(knee,'Shin',bottom,.085,.28,[0,-.17,0]);
    const foot=bone('Foot'+side,knee,[0,-.34,.015]); bones[foot.name]=foot;
    sphere(foot,'Sneaker',shoes,[0,-.025,.09],[.115,.075,.19]);
    sphere(foot,'Sole',topDetail,[0,-.085,.10],[.12,.025,.19]);
  }
  // Brazos en T-pose, con articulaciones independientes para MediaPipe.
  for (const side of ['L','R']) {
    const s=sign(side);
    const shoulder=bone('Shoulder'+side,chest,[s*.245,.08,0]); bones[shoulder.name]=shoulder;
    sphere(shoulder,'ShoulderJoint',skin,[0,0,0],[.12,.12,.12]);
    const upper=bone('UpperArm'+side,shoulder,[s*.07,0,0]); bones[upper.name]=upper;
    capsule(upper,'UpperSleeve',top,.09,.20,[s*.135,0,0],[0,0,s===1?-Math.PI/2:Math.PI/2]);
    const lower=bone('LowerArm'+side,upper,[s*.27,0,0]); bones[lower.name]=lower;
    capsule(lower,'Forearm',skin,.07,.20,[s*.13,0,0],[0,0,s===1?-Math.PI/2:Math.PI/2]);
    const hand=bone('Hand'+side,lower,[s*.27,0,0]); bones[hand.name]=hand;
    sphere(hand,'Palm',skin,[s*.045,0,0],[.085,.07,.055]);
    addFingerBones(hand,side,bones);
    sphere(upper,'SleeveCuff',topDetail,[s*.255,0,0],[.035,.095,.095]);
  }
  // Cabeza grande y mandíbula suave; el modelo femenino tiene mandíbula más estrecha.
  sphere(head,'HeadShape',skin,[0,0,0],[female?.39:.405,.49,.36]);
  sphere(head,'Jaw',skin,[0,-.19,.075],[female?.29:.32,.25,.3]);
  const facial=makeFace(head,recipe,skin,hairColor);
  makeHair(head,hairColor,female);
  // Accesorios sencillos y ligeros.
  if (recipe.glasses) {
    for (const s of [-1,1]) {
      const lens=new THREE.Mesh(new THREE.TorusGeometry(.13,.014,6,20),mat('#20242b'));
      lens.position.set(s*.205,.02,.49); lens.scale.y=1.18; head.add(lens);
    }
    const bridge=capsule(head,'GlassesBridge','#20242b',.012,.16,[0,.02,.49],[0,0,Math.PI/2]); bridge.scale.x=.4;
  }
  if (recipe.cap) {
    sphere(head,'CapCrown',recipe.hat||top,[0,.37,.02],[.46,.16,.43]);
    sphere(head,'CapVisor',recipe.hat||top,[0,.28,.32],[.43,.045,.24]);
  }
  if (recipe.phones) {
    for(const s of [-1,1]) sphere(head,'Headphone',recipe.acc||'#222',[s*.42,-.02,0],[.09,.16,.12]);
    capsule(head,'Headband',recipe.acc||'#222',.035,.55,[0,.34,-.01],[0,0,Math.PI/2]);
  }
  // Prenda inferior y detalles de diseño.
  const belt=capsule(root,'WaistBand',topDetail,.025,.36,[0,1.0,.01]); belt.rotation.z=Math.PI/2;
  if (recipe.print) {
    const emblem=sphere(root,'MVEmblem',topDetail,[.09,1.28,.255],[.045,.045,.012]);
    emblem.material=mat(recipe.print===1?'#ffffff':'#ffcf4a');
  }
  // Base de pies en Y=0; escala uniforme a la altura solicitada.
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root), height=box.max.y-box.min.y;
  const scale=(Number(opts.height)||1.42)/height;
  root.scale.setScalar(scale); root.position.y=-box.min.y*scale;
  const normalized={};
  Object.entries(normMap).forEach(([key,name])=>{if(bones[name])normalized[key]=bones[name];});
  // Los dedos se publican también para conservar compatibilidad con manos articuladas.
  for(const side of ['L','R']){
    const S=side==='L'?'left':'right';
    ['Index','Middle','Ring','Little'].forEach((n,i)=>{
      normalized[S+n+'Proximal']=bones[n+(side==='L'?2:2)+side];
      normalized[S+n+'Intermediate']=bones[n+3+side];
      normalized[S+n+'Distal']=bones[n+4+side];
    });
    normalized[S+'ThumbProximal']=bones['Thumb2'+side];
    normalized[S+'ThumbDistal']=bones['Thumb3'+side];
  }
  const expressions={blink:0,happy:0};
  const expressionManager={
    setValue(k,v){expressions[k]=Number(v)||0;},
    getValue(k){return expressions[k]||0;},
    update(){}
  };
  const avatar={
    scene:root, recipe, bones,
    humanoid:{
      getNormalizedBoneNode:n=>normalized[n]||null,
      getRawBoneNode:n=>bones[normMap[n]]||bones[n]||null,
      normalizedHumanBones:normalized
    },
    expressionManager,
    update(){
      const blink=expressions.blink||0;
      facial.eyes.forEach(e=>{e.scale.y=1-Math.min(.92,blink);});
      facial.mouth.scale.set(1+(expressions.happy||0)*.2,1+(expressions.happy||0)*.15,1);
    },
    dispose(){root.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});}
  };
  return avatar;
}
export async function build(recipe={},opts={}) {
  const r={...recipe};
  return createCharacter(r,opts);
}
