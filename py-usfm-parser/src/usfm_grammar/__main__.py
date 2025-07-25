"""Entry point for the package, when invoked from command line"""

import argparse
import json
import sys
import csv
from lxml import etree

from usfm_grammar import USFMParser, Filter, Format, ORIGINAL_VREF
from usfm_grammar import __version__

all_markers = []
for member in Filter:
    all_markers += member.value


def handle_input_file(arg_parser):
    """If initialsing with USFM or USJ?"""
    infile = arg_parser.parse_args().infile
    input_format = arg_parser.parse_args().in_format
    with open(infile, "r", encoding="utf-8") as usfm_file:
        file_content = usfm_file.read()

    if input_format == Format.JSON or infile.split(".")[-1].lower() in ["json", "usj"]:
        usj_obj = json.loads(file_content)
        my_parser = USFMParser(from_usj=usj_obj)
    elif input_format == Format.USX or infile.split(".")[-1].lower() in ["xml", "usx"]:
        usx_obj = etree.fromstring(file_content)
        my_parser = USFMParser(from_usx=usx_obj)
    elif input_format == Format.USFM:
        my_parser = USFMParser(file_content)
    elif input_format == Format.BIBLENLP:
        texts = file_content.rstrip().split("\n")
        vref_file = arg_parser.parse_args().vref
        bookcode = arg_parser.parse_args().bookcode
        if vref_file is None:
            refs = ORIGINAL_VREF
        else:
            with open(vref_file, "r", encoding="utf-8") as vrf:
                refs = vrf.read().rstrip().split("\n")
        obj = {"vref": refs, "text": texts}
        my_parser = USFMParser(from_biblenlp=obj, book_code=bookcode)
    else:
        raise Exception("Un-recognized input_format!")
    return my_parser


def handle_include_exclude_options(arg_parser):
    """Process list of markers and ENUMs"""
    exclude_markers = arg_parser.parse_args().exclude_markers
    include_markers = arg_parser.parse_args().include_markers

    filter_names = [member.name for member in Filter]
    if exclude_markers is None:
        updated_exclude_markers = None
    else:
        updated_exclude_markers = []
        for itm in exclude_markers:
            if itm.upper() in filter_names:
                updated_exclude_markers += Filter[itm.upper()]
            else:
                updated_exclude_markers.append(itm.lower().replace("\\", ""))
    if include_markers is None:
        updated_include_markers = None
    else:
        updated_include_markers = []
        for itm in include_markers:
            if itm.upper() in filter_names:
                updated_include_markers += Filter[itm.upper()]
            else:
                updated_include_markers.append(itm.lower().replace("\\", ""))
    return updated_exclude_markers, updated_include_markers


def main():  # pylint: disable=too-many-locals
    """handles the command line requests"""
    arg_parser = argparse.ArgumentParser(
        description="Uses the tree-sitter-usfm grammar to parse and convert USFM to "
        + "Syntax-tree, JSON, CSV, USX etc."
    )
    arg_parser.add_argument("infile", type=str, help="input usfm or usj file")

    arg_parser.add_argument(
        "--in_format",
        type=str,
        help="input file format",
        choices=[
            Format.USFM.value,
            Format.JSON.value,
            Format.USX.value,
            Format.BIBLENLP.value,
        ],
        default=Format.USFM.value,
    )
    arg_parser.add_argument(
        "--out_format",
        type=str,
        help="output format",
        choices=[itm.value for itm in Format],
        default=Format.JSON.value,
    )
    arg_parser.add_argument(
        "--include_markers",
        type=str,
        help="the list of of contents to be included",
        choices=[itm.name.lower() for itm in Filter] + all_markers,
        action="append",
    )
    arg_parser.add_argument(
        "--exclude_markers",
        type=str,
        help="the list of of contents to be included",
        choices=[itm.name.lower() for itm in Filter] + all_markers,
        action="append",
    )
    arg_parser.add_argument(
        "--csv_col_sep",
        type=str,
        help="column separator or delimiter. Only useful with format=table.",
        default="\t",
    )
    arg_parser.add_argument(
        "--csv_row_sep",
        type=str,
        help="row separator or delimiter. Only useful with format=table.",
        default="\n",
    )
    arg_parser.add_argument(
        "--ignore_errors",
        help="to get some output from successfully parsed portions",
        action="store_true",
    )
    arg_parser.add_argument(
        "--combine_text",
        help="to be used along with exclude_markers or include_markers, "
        + "to concatinate the consecutive text snippets, "
        + "from different components, or not",
        action="store_true",
    )
    arg_parser.add_argument(
        "--vref",
        help="path to the vref file containing line by line verse reference"
        + " for biblenlp input file",
        default=None,
    )
    arg_parser.add_argument(
        "--bookcode",
        help="book to be exported from biblenlp to usfm format",
        default=None,
    )
    arg_parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )

    my_parser = handle_input_file(arg_parser)

    if my_parser.errors and not arg_parser.parse_args().ignore_errors:
        err_str = "\n\t".join([":".join(err) for err in my_parser.errors])
        print(f"Errors present:\n\t{err_str}")
        sys.exit(1)

    exclude_markers, include_markers = handle_include_exclude_options(arg_parser)

    output_format = arg_parser.parse_args().out_format

    ignore_errors = arg_parser.parse_args().ignore_errors

    match output_format:
        case Format.JSON:
            dict_output = my_parser.to_usj(
                exclude_markers=exclude_markers,
                include_markers=include_markers,
                ignore_errors=ignore_errors,
            )
            print(json.dumps(dict_output, indent=4, ensure_ascii=False))
        case Format.CSV:
            table_output = my_parser.to_list(
                exclude_markers=exclude_markers,
                include_markers=include_markers,
                ignore_errors=ignore_errors,
            )
            outfile = sys.stdout
            writer = csv.writer(
                outfile,
                delimiter=arg_parser.parse_args().csv_col_sep,
                lineterminator=arg_parser.parse_args().csv_row_sep,
            )
            writer.writerows(table_output)
        case Format.USX:
            xmlstr = etree.tostring(
                my_parser.to_usx(ignore_errors=ignore_errors),
                encoding="unicode",
                pretty_print=True,
            )
            print(xmlstr)
        case Format.MD:
            print(my_parser.to_markdown())
        case Format.ST:
            print(my_parser.to_syntax_tree(ignore_errors=ignore_errors))
        case Format.USFM:
            print(my_parser.usfm)
        case Format.BIBLENLP:
            infile = arg_parser.parse_args().infile
            file_parts = infile.split(".")
            file_parts[-1] = "txt"
            file_parts[-2] += "_biblenlp"
            outfile_name = ".".join(file_parts)
            outfile_name2 = outfile_name.replace("_biblenlp.txt", "_biblenlp_vref.txt")
            bible_nlp_dict = my_parser.to_biblenlp_format(ignore_errors=ignore_errors)
            with open(outfile_name, "w", encoding="utf-8") as out1:
                out1.writelines(f"{line}\n" for line in bible_nlp_dict["text"])
            with open(outfile_name2, "w", encoding="utf-8") as out2:
                out2.writelines(f"{line}\n" for line in bible_nlp_dict["vref"])
            print(f"Outputs written to {outfile_name} and {outfile_name2}.")
        case _:
            raise Exception(f"Un-recognized output format:{output_format}!")


if __name__ == "__main__":
    main()
