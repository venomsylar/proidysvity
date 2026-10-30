'use strict';

/* ============================== ІЛЮСТРАЦІЇ КАРТ ==============================
   Картинки лежать у images/cards/<назва-латиницею>.svg. Список нижче оновлюється разом із папкою.
   Якщо для карти картинки ще немає (або файл не завантажився) — показуємо емодзі. */
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', 'ʼ': '', "'": '' };
const slugCache = new Map();
function cardSlug(name) {
  if (slugCache.has(name)) return slugCache.get(name);
  const s = [...String(name).toLowerCase()].map(ch => ch in TRANSLIT ? TRANSLIT[ch] : ch).join('')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  slugCache.set(name, s); return s;
}
const CARD_ART = new Set(['amneziia', 'azbestovyi-fartukh', 'baba-iaha-na-droni', 'babusyna-khustka', 'babusyne-zillia', 'bananova-shkirka', 'banka-ohirkiv', 'bdzholynyi-rii', 'benzopyla', 'bober-budivelnyk', 'boiovyi-bahet', 'boiovyi-borshch', 'borshchovyk-mutant', 'bronezhylet-iz-podushky', 'bronia-zharovnia', 'bronovana-vyshyvanka', 'budylnyk-demon', 'charivne-salo', 'choboty-skorokhody', 'choboty-vuhlynky', 'chorna-dira-v-kysheni', 'chorna-kishka', 'chort-iuryst', 'chotyrylystnyk', 'didova-porada', 'didova-skalka', 'diriavyi-chobit', 'drakon-ekskursovod', 'drakon-iz-zamku', 'drakon-mainer', 'drakon-na-diieti', 'drakon-opaliuvalnyi-sezon', 'drakon-sknara', 'drakonchyk-zapalnychka', 'drakonykha-svekrukha', 'dukh-dedlainu', 'dymova-shashka', 'dynozavr-pensioner', 'elf', 'enerhetyk', 'fakel', 'fokusnyk-zlodiuzhka', 'harbuzovyi-zhakh', 'hitara', 'hnom', 'hnylyi-pomidor', 'hoblin-kolektor', 'holem-zi-starykh-mebliv', 'holodnyi', 'horhona-perukarka', 'hryvnia-v-starii-kurttsi', 'huchnyi-svystok', 'irzha', 'izhak-koliuchkar', 'kachka-kontrolerka', 'kamianyi', 'kapeliukh-fokusnyka', 'kastet-voina', 'kastrulia-sholom', 'kazhan-karaoke', 'kentavr-taksyst', 'khomiak-sknara', 'khrobak-knyhoid', 'kiber-babtsia', 'kistianyi-drakon', 'kit-na-plechi', 'kit-podatkivets', 'knyha-zaklynan', 'kokteil-vohnyk', 'kolchuha-z-kryshechok', 'komar-upyr', 'kompiuternyi-virus', 'korona-korolevy', 'korona-z-folhy', 'koshchii-kolektor', 'kovzany', 'kozatski-vusa', 'kraken-iz-kaliuzhi', 'krevetka-kachok', 'krosivky-bihuna', 'kuriachyi-okorok', 'kurka-nindzia', 'kvantovyi-kit', 'kyshenkovyi-zlodii', 'kyslyi-lymon', 'laboratornyi-khalat', 'lid-za-komir', 'liutyi', 'luk-elfa', 'lych-biurokrat', 'lykho-odnooke', 'mah', 'mahichnyi', 'maliuk', 'mama-pokhvalyla', 'mamyn-dzvinok', 'mantiia-iz-zirkamy', 'mavka-obrazhena', 'mech-kladenets', 'mimik-kholodylnyk', 'molot-hnoma', 'morskyi-zmii-rybalka', 'motyvatsiina-promova', 'mumiia-na-diieti', 'mylna-pina', 'mysha-dyversantka', 'namysto-prababtsi', 'napivroslyk', 'nevdalyi-manikiur', 'nizh-dlia-drakoniachykh-steikiv', 'ohr-kulinar', 'onovlennia-systemy', 'palaiuchyi-mech', 'pan-hlytai', 'parasolka', 'pavuk-pensioner', 'peremoha-v-loterei', 'pertsevyi-balonchyk', 'pes-okhoronets', 'petarda', 'pidnizhka', 'plashch-hetmana', 'podatkova-perevirka', 'podatkovyi-leviafan', 'ponedilok', 'posokh-polovnyk', 'povitriana-kulka', 'pradavnii', 'profvyhorannia', 'prybludna-potvora', 'pryvyd-teshchi', 'raketka-dlia-mukh', 'rankova-kava', 'ravlyk-reketyr', 'rozriadzhenyi-telefon', 'ruchka-sylnisha-za-mech', 'sandali-zi-shkarpetkamy', 'servant-pryvyd', 'shalenyi', 'shapka-vushanka', 'shchyt-kryshka', 'sholom-drushliak', 'sholom-iz-rohamy', 'sholom-manhal', 'shtraf-za-parkuvannia', 'skelet-bukhhalter', 'skelet-dyryhent', 'skovoridka', 'slipucha-fara', 'slyzkyi-plashch', 'snodiine', 'sonechko-shantazhystka', 'sonnyi', 'sontse-shcho-ne-zakhodyt', 'soroka-zlodiika', 'spliachyi-biurokrat', 'strilochnyk', 'susid-iz-perforatorom', 'susidskyi-pudel', 'sviatyi-cherpak', 'syrnyk-syly', 'taiemni-dveri', 'talisman-pivnyk', 'trol-iz-komentariv', 'troleibus-pryvyd', 'tsap-vidbuvailo', 'tsyklop-okulist', 'tytan-prybyralnyk', 'valianky', 'vampir-vehetarianets', 'vdalyi-ponedilok', 'vdalyi-shopinh', 'vedmid-spliukh', 'velycheznyi', 'vesillia-do-ranku', 'vidbyvna-pered-biikoiu', 'vidma-z-borshchem', 'vohnehasnyk', 'vohniana-sokyra', 'vohniane-zillia', 'vohnianyi-zmii-aspid', 'voin', 'vosmynih-barysta', 'vovkulaka', 'vvichlyvyi', 'vykhidnyi-posered-tyzhnia', 'vyla', 'zahublenyi-hamanets', 'zhrets', 'zillia-smilyvosti', 'zillia-tse-ne-ia', 'zlamana-rukoiatka', 'zlyi-husak', 'zlyi-varenyk', 'zlyva-na-holovu', 'zmii-shashlychnyk', 'zmii-stazher', 'zmina-stati', 'znaidena-zanachka', 'zolotyi-unitaz', 'zombi-marshrutnyk']);
const ART_IMG = {};
const artFor = c => (c && c.name && ART_IMG[cardSlug(c.name)]) || null;
function loadCardArt() {
  return Promise.all([...CARD_ART].map(s => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try { // перевірка, що картинку можна передати у 3D (з file:// браузер це забороняє)
        const cv = document.createElement('canvas'); cv.width = cv.height = 2;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 2, 2); g.getImageData(0, 0, 1, 1);
        ART_IMG[s] = img;
      } catch (e) { /* лишаємо емодзі */ }
      res();
    };
    img.onerror = () => res();
    img.src = 'images/cards/' + s + '.svg?v=' + APP_VERSION;
  })));
}
