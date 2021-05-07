# Paradox.js
A library for reading paradox database files (*.db)


# Usage
```javascript
  const ParadoxTable = require("paradox.js")
  const fs = require("fs")
  
  const file = fs.readFileSync("path/to/file")
  const table = new ParadoxTable(file)
```

## Getting records

###  All collumns
```javascript
  /** 
  * Generator method to avoid memory consumption
  * The record is an object where the table column is set as property
  * Example table person -> collumns | name | lastname | birthday
  * {name:'', lastname:'', birthday:''} 
  **/
  for (let record of table.returnRecords()) {
        const name = record.name;
        const lastname = record.lastname;
        const birthday = record.birthday;
  }
```

### Specific collumns only
To get only specifc collumns in, you can pass an array with the column names that must be returned.
```javascript
  /** 
  * Generator method to avoid memory consumption
  * The record is an object where the table column is set as property
  * Example table person -> collumns | name | lastname | birthday
  * {name:'', lastname:''} 
  **/
  for (let record of table.returnRecords(["name", "lastname"])) {
        const name = record.name;
        const lastname = record.lastname;
  }
```

---
When the file size exceeds 100mb it will probably produce a memory error, so the use `--max-old-space-size` flag when running your script.


### Notes

The following data types: Memo BLOb, Binary Large Object, Formatted Memo BLOb, OLE, Graphic BLOb, BCD and Bytes are currently not supported, so you will have to decode them yourself.

***

There are some links below, as well as some documentation written by Randy Beck and Kevin Mitchell in `/documents` in case you want to contribute:

+ https://www.prestwoodboards.com/ASPSuite/kb/document_view.asp?qid=100060
+ https://sourcedaddy.com/ms-access/understanding-field-data-types.html
+ https://nodejs.org/api/buffer.html#buffer_buf_write_string_offset_length_encoding
+ https://gist.github.com/BertrandBordage/9892556#file-paradox-py-L42
