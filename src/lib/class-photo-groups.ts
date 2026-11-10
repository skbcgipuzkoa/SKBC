export type ClassPhotoAlbum = {classId:string;date:string;caption:string;photoIds:string[]};
export type ClassPhotoMonth = {key:string;label:string;albums:ClassPhotoAlbum[]};
export type ClassPhotoYear = {year:string;months:ClassPhotoMonth[]};
const months=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/** Input is already authorized by exact class attendance. Never adds or discovers albums. */
export function orderedClassPhotoAlbums(albums:ClassPhotoAlbum[]):ClassPhotoAlbum[] {
  return albums.filter(album=>album.photoIds.length>0).slice().sort((a,b)=>b.date.localeCompare(a.date)||a.classId.localeCompare(b.classId));
}
export function groupClassPhotoAlbums(albums:ClassPhotoAlbum[]):ClassPhotoYear[] {
  const years=new Map<string,ClassPhotoYear>();
  for(const album of orderedClassPhotoAlbums(albums)) {
    const yearKey=album.date.slice(0,4),monthKey=album.date.slice(0,7);
    let year=years.get(yearKey);if(!year){year={year:yearKey,months:[]};years.set(yearKey,year);}
    let month=year.months.find(item=>item.key===monthKey);
    if(!month){month={key:monthKey,label:months[Number(album.date.slice(5,7))-1]??monthKey,albums:[]};year.months.push(month);}
    month.albums.push(album);
  }
  return [...years.values()];
}
export function flattenClassPhotos(albums:ClassPhotoAlbum[]) {
  return orderedClassPhotoAlbums(albums).flatMap(album=>album.photoIds.map((photoId,index)=>({classId:album.classId,date:album.date,photoId,index})));
}
export function classPhotoDate(date:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?`${date.slice(8,10)}-${date.slice(5,7)}-${date.slice(0,4)}`:date;
}
