import { AppError, matches, hitsTarget, statistics, validateWatch } from './domain.js';
import { ManualSource } from './sources.js';

export class MarketService {
  constructor(repository,notifications,source=new ManualSource()) { this.repo=repository; this.notifications=notifications; this.source=source; }
  createWatch(user,payload) { return this.repo.createWatch(user.id,validateWatch(payload)); }
  record(user,payload) {
    const data=this.source.normalize(payload);
    return this.repo.transaction(()=>{
      const existing=this.repo.observationByRequest(user.id,data.request_id);
      if(existing) {
        if (Object.keys(data).some(key=>data[key] !== existing[key])) throw new AppError(409,'Identificador de envio já usado com outros dados.');
        return {observation:existing,alerts:[],duplicate:true};
      }
      const observation=this.repo.createObservation(user.id,data,this.source.name);
      const alerts=this.repo.watches(user.id).filter(w=>w.active && hitsTarget(w,observation)).map(w=>{
        const alert=this.repo.createAlert(user.id,w,observation);
        this.notifications.enqueue(alert,user);
        return alert;
      });
      return {observation,alerts,duplicate:false};
    });
  }
  history(user,id) {
    const watch=this.repo.watch(user.id,id);
    if(!watch) throw new AppError(404,'Item monitorado não encontrado.');
    const observations=this.repo.observations(user.id).filter(o=>matches(watch,o));
    return {watch,observations,stats:statistics(observations),market:this.repo.offers(user.id,id)};
  }
  dashboard(user) {
    const observations=this.repo.observations(user.id), alerts=this.repo.alerts(user.id), watches=this.repo.watches(user.id);
    return {watches:watches.map(w=>({...w,stats:statistics(observations.filter(o=>matches(w,o)))})),
      observationCount:observations.length,alertCount:alerts.length,activeCount:watches.filter(w=>w.active).length,
      recentObservations:observations.slice(-8).reverse(),recentAlerts:alerts.slice(0,5)};
  }
}
