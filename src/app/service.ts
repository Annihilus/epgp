import { Injectable } from "@angular/core";
import { BehaviorSubject } from 'rxjs';

export interface settingsParams {
  minGP: number,
  decay: number,
  weekEP: number,
}

export interface playerData {
  placement: number;
  name: string;
  description: string;
  ep: number;
  gp: number;
  pr: number;
  log: any[];
}

const ELEMENT_DATA: any[] = [
  // {placement: 3, name: 'Солист', description: 'Солит на пухи', ep: 0, gp: 10, pr: 0, log: [
  //   { text: 'Создание игрока', ep: 500 }
  // ]},
  // {placement: 1, name: 'Новичок', description: '', ep: 0, gp: 0, pr: 0, log: []},
  // {placement: 2, name: 'Ветеран', description: '', ep: 500, gp: 100, pr: 5, log: []},
  // {placement: 4, name: 'Пылесос', description: '', ep: 500, gp: 225, pr: 2, log: []},
];

@Injectable()
export class epgpService {


  public set settings(params: settingsParams) {
    this.updateData(params);

    this._settings = params;
  }

  public get settings(): settingsParams {
    return this._settings;
  }

  private _settings: settingsParams = {
    minGP: 10,
    decay: 10,
    weekEP: 150,
  };

  public players: BehaviorSubject<any> = new BehaviorSubject<any>(ELEMENT_DATA);

  public data: BehaviorSubject<any> = new BehaviorSubject<any>([ELEMENT_DATA]);

  public updateData(params) {
    const data = this.data.getValue()[0];

    data.forEach(item => {
      if (item.gp < params.minGP) {
        this.editPlayer(item.name, 0, { ...item, gp: params.minGP });
      }
    });
  }

  public initData() {

  }

  public decay() {
    const data = this.data.getValue();
    const updatedPlayers = [];
    const lastWeek = data[data.length - 1];

    for (const player of lastWeek) {
      let updatedPlayer = {
        ...player,
        log: [{
          start: true,
          text: 'Начало кд',
          ep: parseInt(player.ep, 0),
          gp: parseInt(player.gp, 0)
        }]
      }

      updatedPlayer = this.weeklyEp(updatedPlayer);

      // TODO remove decayPlayer
      updatedPlayer = this.decayPlayer({...updatedPlayer});
      updatedPlayers.push(updatedPlayer);
    }

    const sortedPlayers = this.sortByPr(updatedPlayers);


    this.data.next([...this.data.getValue(), sortedPlayers]);
    console.log(this.data.getValue());
  }

  public addPlayer(data: any, index: number) {
    const player = data;

    player.log = [
      {
        start: true,
        text: 'Создание пользователя',
        ep: parseInt(player.ep, 0),
        gp: parseInt(player.gp, 0)
      }
    ];

    player.gp = player.gp > this._settings.minGP ? player.gp : this.settings.minGP;
    player.pr = this.calcPR(player.ep, player.gp);

    const updatedData = [];
    let lastAdded = player;

    for (const [i, array] of this.data.getValue().entries()) {
      if (index === i) {
        updatedData.push(this.sortByPr([...array, player]));

        continue;
      }

      if (i > index) {
        let updatedPlayer = {...lastAdded};
        updatedPlayer = this.weeklyEp(updatedPlayer);
        updatedPlayer.log.push({
          decay: true,
          text: 'Decay',
        });

        let result = [...array, updatedPlayer];
        result = this.sortByPr(result);

        updatedData.push(result);

        lastAdded = updatedPlayer;

        continue;
      }

      updatedData.push([...array]);
    }

    this.data.next(updatedData);
  }

  public editPlayer(oldName: string, index: number, data: any) {
    if (!data) {
      return;
    }

    const players = this.data.getValue()[index]
      .filter((x : any) => x.name !== oldName);

    let current = this.data.getValue()[index].find((x: any) => x.name === oldName);
    current = {...current, ...data};

    current.gp = this._settings.minGP >= current.gp ? current.gp : this._settings.minGP;
    current.pr = this.calcPR(data.ep, data.gp);

    const currentWeekUpdated = [...players, current];
    const updatedData = [];

    for (const [i, array] of this.data.getValue().entries()) {
      if (i === index) {
        updatedData.push(currentWeekUpdated);

        continue;
      }

      if (i > index) {
        const filtered = array
          .filter((x : any) => x.name !== oldName);
        const modifier = i - index;
        const updatedPlayer = this.decayPlayer({...data}, modifier);
        let result = [...filtered, updatedPlayer];

        if (i === 0) {
          result = this.sortByPr(result);
        }

        updatedData.push(result);

        continue;
      }

      updatedData.push([...array]);
    }

    this.data.next(updatedData);
  }

  public chargeEPGP(name: string, index: number, data) {
    const weekData = this.data.getValue()[index];
    const player = weekData.find(x => x.name === name);

    player.log.push({
      ep: data.ep ? parseInt(data.ep, 0) : 0,
      gp: data.gp ? parseInt(data.gp, 0) : 0,
      text: data.reason
    });

    let updatedPlayer = this.recalcPlayer(player);

    const players = this.data.getValue()[index]
      .filter((x : any) => x.name !== name);

    const currentWeekUpdated = [...players, updatedPlayer];
    const updatedData = [];
    let startParams = {
      ep: updatedPlayer.ep,
      gp: updatedPlayer.gp,
    };

    for (const [i, array] of this.data.getValue().entries()) {
      if (i === index) {
        updatedData.push(currentWeekUpdated);

        continue;
      }

      if (i > index) {
        const filtered = array
          .filter((x : any) => x.name !== name);
        const modifier = i - index;
        const player = array.find(x => x.name === name);
        player.log[0] = {
          ...player.log[0],
          ep: startParams.ep,
          gp: startParams.gp
        }
        let updatedPlayer = this.recalcPlayer(player);
        let result = [...filtered, updatedPlayer];

        if (i === 0) {
          result = this.sortByPr(result);
        }

        updatedData.push(result);

        continue;
      }

      updatedData.push([...array]);
    }

    this.data.next(updatedData);
  }

  public recalcPlayer(player) {
    player.ep = 0;
    player.gp = 0;

    player.log.forEach(item => {
      if (item.decay) {
        player.ep = Number((player.ep - (player.ep / 100 * (this._settings.decay))).toFixed(2));
        player.gp = Number((player.gp - (player.gp / 100 * (this._settings.decay))).toFixed(2));
        player.gp = this.checkGP(player.gp);

        return;
      }

      if (item.ep) {
        player.ep += item.ep;
      }
      if (item.gp) {
        player.gp += item.gp;
      }
    });

    player.gp = this.checkGP(player.gp);
    player.pr = this.calcPR(player.ep, player.gp);

    return player;
  }

  public checkGP(gp) {
    return gp >= this._settings.minGP ? gp : this._settings.minGP;
  }

  public weeklyEp(player) {
    player.ep += this._settings.weekEP;

    player.log.push({
      text: 'Недельное начисление',
      ep: this._settings.weekEP
    });

    return player;
  }

  public decayPlayer(player: playerData, multiplier: number = 1) {
    if (multiplier === 0) {
      return player;
    }

    player.ep = Number((player.ep - (player.ep / 100 * (this._settings.decay * multiplier))).toFixed(2));
    const gp = Number((player.gp - (player.gp / 100 * (this._settings.decay * multiplier))).toFixed(2));

    player.gp = Number(gp) < this._settings.minGP ? this._settings.minGP : gp;
    player.pr = this.calcPR(player.ep, player.gp);

    player.log.push({
      text: 'Decay',
      decay: true,
    })

    return player;
  }

  public calcPR(ep: number, gp: number): number {
    return Number((ep / gp).toFixed(2));
  }

  public sortByPr(players: playerData[]): playerData[] {
    return players.sort((a: any, b: any) => b.pr - a.pr);
  }

}