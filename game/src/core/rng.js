// 시드 기반 난수 (mulberry32). 같은 시드면 같은 전투·맵이 나온다.
(function (RS) {
  'use strict';

  function Rng(seed) {
    this.s = seed | 0;
  }
  Rng.prototype.next = function () {
    const a = (this.s = (this.s + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (n) {
    return Math.floor(this.next() * n);
  };
  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };
  Rng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };
  Rng.prototype.weighted = function (items, weightOf) {
    let total = 0;
    for (let i = 0; i < items.length; i++) total += weightOf(items[i]);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weightOf(items[i]);
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };
  Rng.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };
  Rng.prototype.seed32 = function () {
    return (this.next() * 4294967296) >>> 0;
  };

  RS.Rng = Rng;
  RS.randomSeed = function () {
    return (Math.random() * 4294967296) >>> 0;
  };
})((globalThis.RS = globalThis.RS || {}));
