const token=document.getElementById('token'),status=document.getElementById('status');
async function render(){const data=await chrome.storage.local.get(['message','token']);status.textContent=data.message||'Não conectado.';if(!token.value)token.value=data.token||'';}
document.getElementById('start').onclick=async()=>{const result=await chrome.runtime.sendMessage({type:'start',token:token.value.trim()});await render();if(result.error)status.textContent=result.error;};
document.getElementById('stop').onclick=async()=>{await chrome.runtime.sendMessage({type:'stop'});await render();};
void render();chrome.storage.onChanged.addListener(render);
