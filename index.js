const fs = require("fs");
const argv = require('minimist')(process.argv.slice(1));
const {byte, integer, longint, pchar, word, pointer, TFldInfoRec} = require("./src/types");


function classify(number) {
    switch (number) {
        case 1: return "Alpha";
        case 2: return "Date";
        case 3: return "Short integer";
        case 4: return "Long integer";
        case 5: return "Currency";
        case 6: return "Number";
        case 9: return "Logical";
        case 20: return "Time";
        case 21: return "Timestamp";
        case 22: return "Autoincrement";
        case 12: return "Memo BLOb";
        case 13: return "Binary Large Object";
        case 14: return "Formatted Memo BLOb";
        case 15: return "OLE";
        case 16: return "Graphic BLOb";
        case 23: return "BCD";
        case 24: return "Bytes";
        default: return "Unknown";
    }
}

function unsetBit(buffer) {
    const b = buffer;
    const firstByte = b[0] - 128;

    if (b.length === 2 && buffer.readUInt16BE() === 0) return null;
    if (b.length === 4 && buffer.readUInt32BE() === 0) return null;

    if (firstByte < 0) return null;
    b.writeUInt8(firstByte);

    return b;
}

function convertTime(buffer) {
    const seconds = unsetBit(buffer);
    if (seconds == null) return null;

    return new Date(seconds.readUInt32BE()).toISOString().substr(11, 8);
}

function convertTimestamp(buffer, dateOffset = 0) {
    const b = unsetBit(buffer);
    if (b == null) return null;

    return (new Date(b.readDoubleBE() - 1000 * 719163 * 86400 + dateOffset))
}

function convertDate(buffer) {
    const date = new Date("0001-01-01");
    const days = unsetBit(buffer);

    if (days === null) return null;

    if (days) {
        date.setDate(date.getDate() + days.readUInt32BE());
        return date;
    }

    return 0
}

class ParadoxTable {
    constructor(buffer) {
        this.buffer = buffer;
        this.recordSize = new integer(buffer, 0, false);
        this.headerSize = new integer(buffer, this.recordSize.upperlimmit, false);
        this.fileType = new byte(buffer, this.headerSize.upperlimmit);
        this.maxTableSize = new byte(buffer, this.fileType.upperlimmit);
        this.numRecords = new longint(buffer, this.maxTableSize.upperlimmit, false);
        this.nextBlock = new word(buffer, this.numRecords.upperlimmit);
        this.fileBlocks = new word(buffer, this.nextBlock.upperlimmit, false);
        this.firstBlock = new word(buffer, this.fileBlocks.upperlimmit);
        this.lastBlock = new word(buffer, this.firstBlock.upperlimmit);
        this.unknown = new word(buffer, this.lastBlock.upperlimmit);
        this.modifiedFlags1 = new byte(buffer, this.unknown.upperlimmit);
        this.indexFieldNumber = new byte(buffer, this.modifiedFlags1.upperlimmit);
        this.primaryIndexWorkspace = new pointer(buffer, this.indexFieldNumber.upperlimmit);
        this.unknown2 = new pointer(buffer, this.primaryIndexWorkspace.upperlimmit);

        //skipped bytes 1e-20,  see /documents/PxFORMAT.txt

        this.numFields = new integer(buffer, parseInt(21, 16), false);
        this.primaryKeyFields = new integer(buffer, this.numFields.upperlimmit);
        this.encryption1 = new longint(buffer, this.primaryKeyFields.upperlimmit);
        this.sortOrder = new byte(buffer, this.encryption1.upperlimmit);
        this.modifiedFlags2 = new byte(buffer, this.sortOrder.upperlimmit);
        //skipped bytes 2b-2c,  see /documents/PxFORMAT.txt
        this.changeCount1 = new byte(buffer, parseInt("2d", 16));
        this.changeCount2 = new byte(buffer, this.changeCount1.upperlimmit);
        //skipped byte 2f,  see /documents/PxFORMAT.txt
        this.tableNamePtrPtr = new pchar(buffer, parseInt(30, 16));
        this.fldInfoPtr = new pointer(buffer, this.tableNamePtrPtr.upperlimmit);
        this.writeProtected = new byte(buffer, this.fldInfoPtr.upperlimmit);
        this.fileVersionID = new byte(buffer, this.writeProtected.upperlimmit);
        this.maxBlocks = new word(buffer, this.fileVersionID.upperlimmit);
        //skipped byte 3c,  see /documents/PxFORMAT.txt
        this.auxPasswords = new byte(buffer, parseInt("3d", 16));
        //skipped bytes 3e-3f,  see /documents/PxFORMAT.txt
        this.cryptInfoStartPtr = new pointer(buffer, parseInt(40, 16));
        this.cryptInfoEndPtr = new pointer(buffer, this.cryptInfoStartPtr.upperlimmit);
        //skipped byte 48,  see /documents/PxFORMAT.txt
        this.autoInc = new longint(buffer, parseInt(49, 16));
        //skipped bytes 4d-4e,  see /documents/PxFORMAT.txt
        this.indexUpdateRequired = new byte(buffer, parseInt("4f", 16));
        //skipped bytes 50-54,  see /documents/PxFORMAT.txt
        this.refIntegrity = new byte(buffer, parseInt(55, 16));
        //skipped bytes 56-57,  see /documents/PxFORMAT.txt
        this.unknown3 = new integer(buffer, parseInt(58, 16));
        this.unknown4 = new integer(buffer, this.unknown3.upperlimmit);
        this.encryption2 = new longint(buffer, this.unknown4.upperlimmit);
        this.fileUpdateTime = new longint(buffer, this.encryption2.upperlimmit);
        this.hiFieldID = new integer(buffer, this.fileUpdateTime.upperlimmit);
        this.hiFieldIDinfo = new integer(buffer, this.hiFieldID.upperlimmit);
        this.sometimesNumFields = new integer(buffer, this.hiFieldIDinfo.upperlimmit);
        this.dosGlobalCodePage = new integer(buffer, this.sometimesNumFields.upperlimmit);
        //skipped bytes 6c-6f,  see /documents/PxFORMAT.txt
        this.changeCount4 = new integer(buffer, parseInt(70, 16));
        this.tFldInfoRecArray = [];
        
        const start = 120; // parseInt(78,16);
        let i = start;
        for (i; i < (start + this.numFields.getValue() * 2); i += 2) {
            this.tFldInfoRecArray.push(new TFldInfoRec(buffer, i))
        }

        this.pcharArray = [];

        for (let j = i; i <= j + this.numFields.getValue() * 4; i = i+4) {
            this.pcharArray.push(new pchar(buffer, i))
        }

        const initialDBNameStart = i;
        let initialDBNameEnd = i;

        while (buffer[initialDBNameEnd] !== 0) {
            initialDBNameEnd++
        }

        this.initialTableName = buffer.slice(initialDBNameStart, initialDBNameEnd);
        let blockLimit = initialDBNameEnd;

        while (buffer[blockLimit] === 0) {
            blockLimit++;
        }

        const initialBlockLimit = blockLimit;

        while (buffer[blockLimit] >= 30 || buffer[blockLimit + 1] >= 30) {
            blockLimit++;
        }

        this.fieldArray = buffer.slice(initialBlockLimit, blockLimit).toString('utf8').split('\u0000');

        for (let k = 0; k < this.tFldInfoRecArray.length; k++) {
            this.tFldInfoRecArray[k].addName(this.fieldArray[k]);
        }

        //console.log(tFldInfoRecArray)
        this.firstaddDataSize = this.buffer.slice(this.headerSize.getValue() + 4, this.headerSize.getValue() + 6);
        //there must be a better way to find the portion of the .db file which contains all the field names
        //I decided to skip what comes after the field names, see /documents/PxFORMAT.txt . I'm assuming that the database to be read is unencrypted
    }

    /**
     * (Generator) Returns all records one after another with All columns or the specified columns only
     * @param {Array[String]} columns List of columns that will be returned 
     */
    * returnRecords(columns = []) {
        const _getAddDataSize = (buff, offset) => buff.slice(offset + 4, offset + 6);
        const blockSize = this.maxTableSize.getValue() * 1024;

        const numberOfBlocks = this.fileBlocks.getValue();

        //Go through each block
        for (let i = 0; i < numberOfBlocks; i++) {
            const addDataSize = _getAddDataSize(this.buffer, this.headerSize.getValue() + blockSize * i);
            const numRecordsInBlock = addDataSize.readUInt16LE() / this.recordSize.getValue() + 1;
            let recordsStart = this.headerSize.getValue() + blockSize * i + 6;
            //Go through each record
            for (let j = 0; j < numRecordsInBlock; j++) {
                const record = {};

                //Go through each field
                for (let k = 0; k < this.tFldInfoRecArray.length; k++) {
                    const field = this.tFldInfoRecArray[k];
                    const name = field.name;
                    if (!columns.length || columns.includes(name)) {
                        if (field.getType() === 1) {

                            // Iterate over the bytes in this string and remove all ascii 0/null characters
                            // this increases performance, since the 0 bytes don't need to be converted to its 
                            // u0000 equivalent
                            const fieldSize = field.getSize();
                            let bytesForString = [];
                            for (let l = 0; l < fieldSize; l++) {
                                const b = this.buffer[recordsStart + l];
                                if (b !== 0) {
                                    bytesForString.push(b);
                                }
                            }

                            record[name] = String.fromCharCode(...bytesForString);
                        } else {
                            const valueBuffer = this.buffer.slice(recordsStart, recordsStart + field.getSize());

                            const valuefield = new Field(name, field.getType(), valueBuffer);
                            record[name] = valuefield.value;
                        }
                    }

                    recordsStart += field.getSize();
                }

                yield record;
            }
        }
    }
}

class Field {
    constructor(name, type, value, encoding = "ascii", dateOffset = 0) {
        this.name = name;
        this.type = type;
        this.valueBuffer = value;
        this.hasBeenProperlyDecoded = true;
        this.typeName = classify(type);
        //        |      |           fType  fSize(decimal)                                     |
        switch (this.type) {
            case 1:
                //        |      |            $01     v   "A"  Alpha                                   |
                this.value = value.toString(encoding)
                break
            case 2:
                //        |      |            $02     4   "D"  Date                                    |
                this.value = convertDate(this.valueBuffer);
                break;
            case 3:
                //        |      |            $03     2   "S"  Short integer                           |
                this.value = value.readUInt16LE();
                break;
            case 4: {
                //        |      |            $04     4   "I"  Long integer                            |
                const result = unsetBit(value);
                this.value = result ? result.readUInt32BE() : null;
                break;
            }
            case 5:
            //        |      |            $05     8   "$"  currency                                |
            case 6:
                //        |      |            $06     8   "N"  Number  
                const result = unsetBit(value);
                this.value = result ? result.readDoubleBE() : null;
                break;
            case 9:
                this.value = !!(this.valueBuffer[0] - 128);
                //        |      |            $09     1   "L"  Logical                                 |
                break;
            case 20:
                //        |      |            $14     4   "T"  Time                                    |
                this.value = convertTime(this.valueBuffer);
                break;
            case 21:
                //        |      |            $15     8   "@"  Timestamp                               |
                this.hasBeenProperlyDecoded = false;
                this.value = convertTimestamp(this.valueBuffer, dateOffset);
                break;
            case 22:
                //        |      |            $16     4   "+"  Autoincrement                           |
                const test = unsetBit(this.valueBuffer);
                this.hasBeenProperlyDecoded = false;
                this.value = test ? test.readUInt32BE() : test;
                break;
            case 12:
            //        |      |            $0C     v   "M"  Memo BLOb                               |
            case 13:
            //        |      |            $0D     v   "B"  Binary Large Object                     |
            case 14:
            //        |      |            $0E     v   "F"  Formatted Memo BLOb                     |
            case 15:
            //        |      |            $0F     v   "O"  OLE                                     |
            case 16:
            //        |      |            $10     v   "G"  Graphic BLOb                            |
            case 23:
            //        |      |            $17    17*  "#"  BCD                                     |
            case 24:
            //        |      |            $18     v   "Y"  Bytes                                   |
            //I will leave the decoding of these data types for the user of this library because I guess it depends on the type of data stored, unless you'd like to contribute to this proyect
            // this.hasBeenProperlyDecoded = false
            // this.value = this.valueBuffer
            // break;
            default:
                this.hasBeenProperlyDecoded = false;
                this.value = this.valueBuffer;
                break
        }
    }
}

function measurePerformance(f) {
    const file = fs.readFileSync(f);
    const t = new ParadoxTable(file);
    console.time();
    
    // Pass an array with the columns that need to be returned
    // When no columnns are passed, then all will be returned
    //for (let record of t.returnRecords(["Omschrijving", "Eannummer","Artikelnummer","KassaArtikel"])) {
    for (let record of t.returnRecords()) {
        const rec = record;
    }
    console.timeEnd();
}

if (!module.parent) {
    if (argv.f) {
        // Measure Performance
        measurePerformance(argv.f);
        measurePerformance(argv.f);
        measurePerformance(argv.f);
        measurePerformance(argv.f);
        measurePerformance(argv.f);
        measurePerformance(argv.f);
    } else {
        console.log("-f argument required");
    }

}

module.exports = ParadoxTable;