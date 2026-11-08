export function previousFriday(today=new Date()) {
 const friday=new Date(today);
 friday.setDate(today.getDate()-((today.getDay()+1)%7+1));
 return [friday.getFullYear(),String(friday.getMonth()+1).padStart(2,'0'),String(friday.getDate()).padStart(2,'0')].join('-');
}
